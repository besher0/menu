import { publicUploadUrl } from "../../common/public-upload-url";
import { nextProductSortOrder, productOrderTransaction } from "./product-sort-order";
import { preparePublicConfigurationCatalog, resolveProductFromCatalog, type PublicProductConfigurationResponse } from "../public-menu/public-product-configuration";
import { ProductEditorService } from "./product-editor.service";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { validateCurrencyAmount, calculateMinimumPriceV2 } from "@menu/shared";
import { slugify } from "../../common/slugify";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { approvedModelFormat, allowedImageReference } from "../media/asset-reference";
import { ProductLibraryService } from "../media/product-library.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { initialNetworkSetupConfiguration, isUnpricedNetworkSetup } from "./network-setup-configuration";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService,
    @Inject(ProductLibraryService) private readonly productLibrary: ProductLibraryService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async list(restaurantId: string, query: ListProductsQueryDto = {}) {
    const page = this.clampPositiveInt(query.page, 1);
    const limit = query.limit === undefined ? undefined : this.clampPositiveInt(query.limit, 20);
    const where: Prisma.ProductWhereInput = {
      restaurantId,
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.availability === "available" ? { isAvailable: true } : {}),
      ...(query.availability === "unavailable" ? { isAvailable: false } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const orderBy = this.productOrderBy(query.sort);
    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
      include: {
        category: true,
        images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        media3d: true,
        vrMedia: true,
        options: {
          orderBy: { sortOrder: "asc" },
          include: {
            options: { orderBy: { sortOrder: "asc" } }
          }
        }
        },
        orderBy,
        ...(limit === undefined ? {} : { skip: (page - 1) * limit, take: limit })
      })
    ]);
    const views = await this.productViewCounts(
      restaurantId,
      products.map((product) => ({ id: product.id, slug: product.slug }))
    );

    // Dashboard presentation only: reuse the public resolver and Shared minimum
    // calculator. Never invent a Base price for Network or return another tenant.
    const configurationBaseEditable = new Map<string,boolean>();
    const configurationPrices = new Map<string, Pick<PublicProductConfigurationResponse,"minimumPrice"|"priceDisplay">>();
    if (products.some(p => p.configurationTree !== null && p.configurationVersion > 0)) {
      const [catalogProducts, currency, capabilityEnabled] = await Promise.all([
        this.prisma.product.findMany({ where: { restaurantId, deletedAt: null }, select: {
          id:true,restaurantId:true,currency:true,slug:true,name:true,basePrice:true,
          configurationTree:true,configurationVersion:true,isActive:true,isAvailable:true,deletedAt:true
        } }), this.restaurantCurrency(restaurantId), this.featureFlags.canUseAssignedFeature(restaurantId,"PRODUCT_CONFIGURATION")
      ]);
      const catalog = preparePublicConfigurationCatalog({restaurantId,currency,capabilityEnabled,catalogProducts});
      for (const product of products) {
        const record = catalog.products.get(product.id);
        const result = record ? resolveProductFromCatalog(record,catalog) : null;
        if (result) {
          configurationPrices.set(product.id,{minimumPrice:result.minimumPrice,priceDisplay:result.priceDisplay});
          // Reuse the engine's Base decision, including ORIGINAL/CUSTOM resolved sizes.
          const minimum=catalog.minimums.get(product.id)??calculateMinimumPriceV2(result.configuration,catalog.context);
          configurationBaseEditable.set(product.id,result.configuration.basePrice!==null && product.basePrice!==null && minimum.orderable && !minimum.baseIgnored);
        }
      }
    }
    return {
      data: products.map((product) => ({...this.serializeProduct(product, views.get(product.id) ?? 0),
        ...(configurationBaseEditable.has(product.id)?{basePriceEditable:configurationBaseEditable.get(product.id)}:{}),
        ...(configurationPrices.has(product.id)?{configurationPrice:configurationPrices.get(product.id)}:{})})),
      meta: {
        page,
        limit: limit ?? total,
        total,
        pages: limit === undefined ? 1 : Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async create(restaurantId: string, dto: CreateProductDto, allowAdvancedMedia = false) {
    await this.assertCategory(restaurantId, dto.categoryId);
    for (const image of this.productImageInputs(dto)) await allowedImageReference(this.prisma,restaurantId,image.url);
    if (allowAdvancedMedia && dto.vrUrl) await allowedImageReference(this.prisma,restaurantId,dto.vrUrl);
    if (allowAdvancedMedia && dto.model3dUrl) dto.model3dFormat = await approvedModelFormat(this.prisma,restaurantId,dto.model3dUrl);
    if (dto.basePrice !== undefined) {
      const currency = await this.restaurantCurrency(restaurantId);
      this.assertCurrencyPrice(dto.basePrice, currency);
    }
    const networkSetup = dto.configurationIntent === "NETWORK_SETUP";
    if (networkSetup) {
      await this.featureFlags.assertAssignedFeature(restaurantId, "PRODUCT_CONFIGURATION");
      if (dto.basePrice !== undefined) {
        throw new BadRequestException("Network setup must not contain a provisional base price");
      }
    }
    if (!networkSetup && dto.basePrice === undefined) {
      throw new BadRequestException("Legacy product creation requires basePrice");
    }
    const limit = await this.featureFlags.getFeatureLimit(restaurantId, "MAX_PRODUCTS");
    const currentCount = await this.prisma.product.count({
      where: { restaurantId, deletedAt: null }
    });

    if (limit !== null && currentCount >= limit) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "FEATURE_LIMIT_REACHED",
        message: "Product limit reached for current subscription",
        featureKey: "MAX_PRODUCTS"
      });
    }

    const productSlug = await this.uniqueProductSlug(restaurantId, dto.slug || dto.name);
    const setupProductId = networkSetup ? randomUUID() : undefined;
    const setupConfiguration = setupProductId ? initialNetworkSetupConfiguration(setupProductId) : undefined;

    const product = await productOrderTransaction(this.prisma,async tx=>tx.product.create({
      data: {
        ...(setupProductId ? { id: setupProductId } : {}),
        restaurantId,
        sortOrder:await nextProductSortOrder(tx,restaurantId,dto.categoryId??null),
        categoryId: dto.categoryId,
        name: dto.name,
        slug: productSlug,
        description: dto.description,
        basePrice: networkSetup ? null : dto.basePrice,
        ...(setupConfiguration ? {
          configurationTree: setupConfiguration as Prisma.InputJsonValue,
          configurationVersion: setupConfiguration.revision
        } : {}),
        // One INSERT persists Network identity and null Base atomically; no
        // priced Legacy shell is ever visible, even if creation is interrupted.
        ...(networkSetup ? { isAvailable: false } : {}),
        currency: dto.currency ?? "ل.س",
        moodKey: this.serializeMoodKeyValue(this.normalizeMoodKeysInput(dto)),
        ingredients: dto.ingredients as Prisma.InputJsonValue | undefined,
        nutrition: dto.nutrition as Prisma.InputJsonValue | undefined,
        isFeatured: dto.isFeatured ?? false,
        isNew: dto.isNew ?? dto.isFeatured ?? false,
        isPopular: dto.isPopular ?? false,
        media3d: allowAdvancedMedia && dto.model3dUrl
          ? {
              create: {
                url: dto.model3dUrl,
                format: dto.model3dFormat || this.infer3dFormat(dto.model3dUrl)
              }
            }
          : undefined,
        vrMedia: allowAdvancedMedia && dto.vrUrl
          ? {
              create: {
                panoramaUrl: dto.vrUrl,
                type: dto.vrType || "PANORAMA"
              }
            }
          : undefined,
        images: this.productImageInputs(dto).length
          ? {
              create: this.productImageInputs(dto).map((image, index) => ({
                url: image.url,
                altText: image.altText ?? dto.name,
                sortOrder: index
              }))
            }
          : undefined
      },
      include: {
        category: true,
        images: true,
        media3d: true,
        vrMedia: true,
        options: { include: { options: true } }
      }
    }));

    return this.serializeProduct(product);
  }

  async findOne(restaurantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null },
      include: {
        category: true,
        images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        media3d: true,
        vrMedia: true,
        options: { include: { options: true } }
      }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return this.serializeProduct(product);
  }

  async ingredients(restaurantId: string) {
    const [library, products] = await Promise.all([
      this.prisma.ingredientLibraryItem.findMany({
        where: { isActive: true },
        orderBy: [{ isActive: "desc" }, { adminName: "asc" }]
      }),
      this.prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      select: { ingredients: true },
      orderBy: { updatedAt: "desc" },
      take: 500
      })
    ]);
    const usage = new Map<string, number>();
    const legacy = new Map<string, { name: string; displayName: string; imageUrl: string; usageCount: number }>();

    for (const product of products) {
      if (!Array.isArray(product.ingredients)) continue;

      for (const item of product.ingredients) {
        const normalized = this.normalizeIngredientItem(item);
        if (!normalized) continue;

        const key = (normalized.adminName || normalized.name).toLocaleLowerCase();
        const imageUrl = this.publicAssetUrl(normalized.imageUrl) ?? "";
        usage.set(key, (usage.get(key) ?? 0) + 1);
        const existing = legacy.get(key);
        if (existing) {
          existing.usageCount += 1;
          if (!existing.imageUrl && imageUrl) {
            existing.imageUrl = imageUrl;
          }
        } else {
          legacy.set(key, {
            name: normalized.name,
            displayName: normalized.displayName || normalized.name,
            imageUrl,
            usageCount: 1
          });
        }
      }
    }

    const libraryKeys = new Set(library.map((item) => item.adminNameNormalized));
    const librarySuggestions = library.map((item) => ({
      id: item.id,
      libraryId: item.id,
      adminName: item.adminName,
      displayName: item.displayName,
      name: item.displayName,
      imageUrl: this.publicAssetUrl(item.imageUrl) ?? "",
      isActive: item.isActive,
      usageCount: usage.get(item.adminNameNormalized) ?? 0
    }));
    const legacySuggestions = Array.from(legacy.entries())
      .filter(([key]) => !libraryKeys.has(key))
      .map(([, value]) => value);

    return {
      data: [...librarySuggestions, ...legacySuggestions]
        .sort((left, right) => right.usageCount - left.usageCount || left.name.localeCompare(right.name, "ar"))
        .slice(0, 200)
    };
  }

  async mealDetails(restaurantId: string) {
    const [library, products] = await Promise.all([
      this.prisma.mealDetailLibraryItem.findMany({
        where: { isActive: true },
        orderBy: [{ isActive: "desc" }, { adminName: "asc" }]
      }),
      this.prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      select: { nutrition: true },
      orderBy: { updatedAt: "desc" },
      take: 500
      })
    ]);
    const usage = new Map<string, number>();
    const details = new Map<string, { label: string; displayName: string; value: string; icon: string; iconUrl: string; usageCount: number }>();

    for (const product of products) {
      for (const detail of this.normalizeMealDetails(product.nutrition)) {
        const key = (detail.adminName || detail.label).toLocaleLowerCase();
        usage.set(key, (usage.get(key) ?? 0) + 1);
        const existing = details.get(key);
        if (existing) {
          existing.usageCount += 1;
        } else {
          details.set(key, { ...detail, displayName: detail.displayName || detail.label, usageCount: 1 });
        }
      }
    }

    const libraryKeys = new Set(library.map((item) => item.adminNameNormalized));
    const librarySuggestions = library.map((item) => ({
      id: item.id,
      libraryId: item.id,
      adminName: item.adminName,
      displayName: item.displayName,
      label: item.displayName,
      value: item.value ?? "",
      valueType: item.valueType,
      icon: item.icon,
      iconUrl: this.publicAssetUrl(item.iconUrl) ?? "",
      isActive: item.isActive,
      usageCount: usage.get(item.adminNameNormalized) ?? 0
    }));
    const legacySuggestions = Array.from(details.entries())
      .filter(([key]) => !libraryKeys.has(key))
      .map(([, value]) => value);

    return {
      data: [...librarySuggestions, ...legacySuggestions]
        .sort((left, right) => right.usageCount - left.usageCount || left.label.localeCompare(right.label, "ar"))
        .slice(0, 200)
    };
  }

  async createImportedProduct(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    input: {
      categoryId: string;
      name: string;
      description?: string | null;
      basePrice: number | string;
      currency: string;
      isPopular: boolean;
      isNew: boolean;
      moodKeys: string[];
      ingredients: Prisma.InputJsonValue[];
      nutrition: Prisma.InputJsonValue;
      images: Array<{ url: string; mediaId?: string; altText?: string }>;
      sortOrder: number;
    }
  ) {
    const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { currency: true } });
    if (!restaurant) throw new NotFoundException("Restaurant not found");
    this.assertCurrencyPrice(input.basePrice, restaurant.currency);
    const slug = await this.uniqueProductSlug(restaurantId, input.name, undefined, tx);

    return tx.product.create({
      data: {
        restaurantId,
        editVersion: 1,
        categoryId: input.categoryId,
        name: input.name,
        slug,
        description: input.description,
        basePrice: input.basePrice,
        currency: input.currency,
        isPopular: input.isPopular,
        isNew: input.isNew,
        isFeatured: input.isNew,
        moodKey: this.serializeMoodKeyValue(input.moodKeys),
        ingredients: input.ingredients,
        nutrition: input.nutrition,
        sortOrder: input.sortOrder,
        images: input.images.length
          ? {
              create: input.images.map((image, index) => ({
                mediaId: image.mediaId,
                url: image.url,
                altText: image.altText ?? input.name,
                sortOrder: index
              }))
            }
          : undefined
      }
    });
  }

  async update(restaurantId: string, id: string, dto: CreateProductDto, allowAdvancedMedia = false) {
    if (!Number.isSafeInteger(dto.expectedProductVersion)) throw new BadRequestException("expectedProductVersion is required");
    if (dto.configurationIntent !== undefined) throw new BadRequestException("Use the unified editor to configure a product");
    const editor = new ProductEditorService(this.prisma);
    const current = await editor.read(restaurantId, id);
    await editor.save(restaurantId, id, {
      create: false, expectedProductVersion: dto.expectedProductVersion!,
      expectedConfigurationVersion: current.configurationVersion,
      product: {
        ...current.product, name: dto.name,
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.basePrice !== undefined ? { basePrice: String(dto.basePrice) } : {}),
        ...(dto.moodKeys !== undefined || dto.moodKey !== undefined ? { moodKeys: this.normalizeMoodKeysInput(dto) } : {}),
        ...(dto.images !== undefined || dto.imageUrl !== undefined ? { images: this.productImageInputs(dto) } : {}),
        ...(dto.ingredients !== undefined ? { ingredients: dto.ingredients.map(x => typeof x === "string" ? { name: x } : x) as typeof current.product.ingredients } : {}),
        ...(dto.nutrition !== undefined ? { mealDetails: (dto.nutrition as { details: typeof current.product.mealDetails }).details ?? current.product.mealDetails } : {}),
        isNew: dto.isNew ?? dto.isFeatured ?? current.product.isNew,
        isFeatured: dto.isFeatured ?? dto.isNew ?? current.product.isFeatured,
        isPopular: dto.isPopular ?? current.product.isPopular
      },
      ...(dto.model3dUrl !== undefined || dto.vrUrl !== undefined ? { advancedMedia: {
        ...current.advancedMedia,
        ...(dto.model3dUrl !== undefined ? { model3dUrl: dto.model3dUrl } : {}),
        ...(dto.vrUrl !== undefined ? { vrUrl: dto.vrUrl } : {})
      } } : {})
    }, allowAdvancedMedia);
    return this.findOne(restaurantId, id);
  }

  async toggleAvailability(restaurantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    if (!product.isAvailable && isUnpricedNetworkSetup(product.configurationTree)) {
      throw new ConflictException({
        statusCode: 409,
        error: "PRODUCT_CONFIGURATION_SETUP_INCOMPLETE",
        message: "Complete the Network configuration before making this product available."
      });
    }

    await this.prisma.product.update({
      where: { id },
      data: { isAvailable: !product.isAvailable }
    });
    return this.findOne(restaurantId, id);
  }

  async updateSortOrder(restaurantId: string, id: string, sortOrder: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { sortOrder },
      include: {
        category: true,
        images: true,
        media3d: true,
        vrMedia: true,
        options: { include: { options: true } }
      }
    });

    return this.serializeProduct(updated);
  }

  async updatePrice(restaurantId: string, id: string, basePrice: number, expectedProductVersion?: number) {
    if (!Number.isSafeInteger(expectedProductVersion)) throw new BadRequestException("expectedProductVersion is required");
    const product = await this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }
    this.assertCurrencyPrice(basePrice, await this.restaurantCurrency(restaurantId));

    if (product.configurationTree !== null && product.configurationVersion > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: "PRODUCT_CONFIGURATION_PRICE_MANAGED",
        message: "Use the product configuration endpoint to change pricing for a network product."
      });
    }

    const updated = await this.prisma.product.updateMany({
      where: { id, restaurantId, deletedAt: null, configurationVersion: 0, editVersion: expectedProductVersion },
      data: { basePrice, editVersion: { increment: 1 } }
    });
    if (updated.count !== 1) throw new ConflictException({ error: "PRODUCT_EDIT_VERSION_CONFLICT", message: "Reload the product before changing its price." });
    return this.findOne(restaurantId, id);
  }

  private async assertCategory(restaurantId: string, id?: string | null) {
    if (!id) return;
    const category = await this.prisma.category.findFirst({ where: { id, restaurantId, deletedAt: null }, select: { id: true } });
    if (!category) throw new BadRequestException("Category unavailable");
  }

  private async restaurantCurrency(restaurantId: string): Promise<string> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { currency: true } });
    if (!restaurant) throw new NotFoundException("Restaurant not found");
    return restaurant.currency;
  }

  private assertCurrencyPrice(price: number | string, currency: string): void {
    const issues = validateCurrencyAmount(String(price), currency, "$product.basePrice");
    if (issues.length) throw new BadRequestException({
      error: issues[0].code,
      message: issues[0].code === "SYP_FRACTIONAL_PRICE"
        ? "SYP prices must be whole amounts; fractional values are not allowed."
        : "Product price is invalid.",
      issues
    });
  }

  async reorder(restaurantId: string, items: Array<{ id: string; sortOrder: number }>) {
    await this.prisma.$transaction(async tx => {
      const catalog = await tx.product.findMany({
        where: { restaurantId, deletedAt: null }, select: { id: true, categoryId: true }
      });
      const ranks = new Map(items.map(item => [item.id, item.sortOrder]));
      const selected = catalog.filter(row => ranks.has(row.id));
      if (!items.length || selected.length !== items.length) throw new BadRequestException("Invalid reorder scope");
      if (new Set(ranks.values()).size !== items.length) throw new BadRequestException("Duplicate ranks");
      if (selected.length !== catalog.length) {
        const category = selected[0].categoryId;
        if (selected.some(row => row.categoryId !== category) ||
            catalog.some(row => row.categoryId === category && !ranks.has(row.id))) {
          throw new BadRequestException("Submit the complete catalog or one complete category");
        }
      }
      for (const item of items) {
        await tx.product.update({ where: { id: item.id, restaurantId }, data: { sortOrder: item.sortOrder } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.list(restaurantId, { page: 1, limit: Math.max(items.length, 20), sort: "sortOrder" });
  }

  async delete(restaurantId: string, id: string) {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const product = await transaction.product.findFirst({
          where: { id, restaurantId, deletedAt: null }
        });

        if (!product) {
          throw new NotFoundException("Product not found");
        }

        const dependents = await transaction.productConfigurationDependency.findMany({
          where: { restaurantId, sourceProductId: id },
          select: {
            productId: true,
            optionId: true,
            path: true,
            owner: { select: { name: true } }
          },
          orderBy: { productId: "asc" }
        });
        if (dependents.length) {
          throw new ConflictException({
            statusCode: 409,
            error: "PRODUCT_CONFIGURATION_DEPENDENCY_EXISTS",
            message: "This product is used by another product configuration and cannot be removed.",
            dependents: dependents.map((dependency) => ({
              productId: dependency.productId,
              productName: dependency.owner.name,
              optionId: dependency.optionId,
              path: dependency.path
            }))
          });
        }

        await transaction.product.update({
          where: { id },
          data: {
            isActive: false,
            isAvailable: false,
            deletedAt: new Date()
          }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new ConflictException({
          statusCode: 409,
          error: "PRODUCT_CONFIGURATION_DELETE_CONFLICT",
          message: "Product dependencies changed concurrently; reload and retry deletion."
        });
      }
      throw error;
    }

    return { deleted: true };
  }

  private serializeProduct(product: any, views = 0) {
    const moodKeys = this.parseStoredMoodKeys(product.moodKey);
    const basePriceEditable = product.configurationTree == null && !product.configurationVersion;

    return {
      basePriceEditable,
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      basePrice: product.basePrice === null || product.basePrice === undefined ? null : Number(product.basePrice),
      configurationMode:
        product.configurationTree !== null && product.configurationVersion > 0 ? "NETWORK" : "LEGACY",
      configurationVersion: product.configurationVersion ?? 0,
      editVersion: product.editVersion,
      currency: product.currency,
      isActive: product.isActive,
      isAvailable: product.isAvailable,
      isFeatured: product.isFeatured,
      isNew: product.isNew,
      isPopular: product.isPopular,
      moodKey: moodKeys[0] ?? null,
      moodKeys,
      sortOrder: product.sortOrder,
      views,
      ingredients: this.serializeIngredients(product.ingredients),
      nutrition: this.serializeNutrition(product.nutrition),
      category: product.category && product.category.restaurantId === product.restaurantId
        ? {
            id: product.category.id,
            slug: product.category.slug,
            name: product.category.name
          }
        : null,
      images: product.images?.map((image: any) => ({
        id: image.id,
        url: this.publicAssetUrl(image.url),
        altText: image.altText
      })),
      media: {
        has3d: Boolean(product.media3d?.isActive),
        hasVr: Boolean(product.vrMedia?.isActive),
        model3dUrl: product.media3d?.isActive ? this.publicAssetUrl(product.media3d.url) : null,
        model3dFormat: product.media3d?.format ?? null,
        vrUrl: product.vrMedia?.isActive ? this.publicAssetUrl(product.vrMedia.panoramaUrl) : null,
        vrType: product.vrMedia?.type ?? null
      },
      options: product.options ?? []
    };
  }

  private productOrderBy(sort?: ListProductsQueryDto["sort"]): Prisma.ProductOrderByWithRelationInput[] {
    if (sort === "newest") return [{ createdAt: "desc" }];
    if (sort === "priceAsc") return [{ basePrice: "asc" }, { sortOrder: "asc" }];
    if (sort === "priceDesc") return [{ basePrice: "desc" }, { sortOrder: "asc" }];
    if (sort === "name") return [{ name: "asc" }];
    return [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "desc" }];
  }

  private productImageInputs(dto: CreateProductDto) {
    const images = dto.images !== undefined
      ? dto.images
      : dto.imageUrl
        ? [{ url: dto.imageUrl, altText: dto.name }]
        : [];

    const seen = new Set<string>();
    return images
      .map((image) => ({
        url: image.url?.trim() ?? "",
        altText: image.altText?.trim() || dto.name
      }))
      .filter((image) => {
        if (!image.url || seen.has(image.url)) return false;
        seen.add(image.url);
        return true;
      });
  }

  private normalizeMoodKeysInput(dto: CreateProductDto) {
    const source = dto.moodKeys?.length ? dto.moodKeys : this.parseStoredMoodKeys(dto.moodKey);
    const seen = new Set<string>();

    return source
      .map((key) => key.trim())
      .filter((key) => {
        const normalized = key.toLocaleLowerCase();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  private serializeMoodKeyValue(keys: string[]) {
    if (!keys.length) return null;
    if (keys.length === 1) return keys[0];
    return JSON.stringify(keys);
  }

  private parseStoredMoodKeys(value?: string | null) {
    const fallback = value?.trim();
    if (!fallback) return [];

    try {
      const parsed = JSON.parse(fallback);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
      }
    } catch {
      // Existing products store a single mood label directly.
    }

    return [fallback];
  }

  private async uniqueProductSlug(
    restaurantId: string,
    value: string,
    excludeId?: string,
    client: Pick<PrismaService, "product"> | Prisma.TransactionClient = this.prisma
  ) {
    const base = slugify(value) || "product";
    let candidate = base;
    let suffix = 2;

    while (await client.product.findFirst({
      where: {
        restaurantId,
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private normalizeIngredientItem(item: Prisma.JsonValue) {
    if (typeof item === "string") {
      const name = item.trim();
      return name ? { name, displayName: name, adminName: "", imageUrl: "" } : null;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, Prisma.JsonValue>;
    const displayName = typeof record.displayName === "string" ? record.displayName.trim() : "";
    const adminName = typeof record.adminName === "string" ? record.adminName.trim() : "";
    const name = (typeof record.name === "string" ? record.name.trim() : "") || displayName;
    const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";

    return name ? { name, displayName: displayName || name, adminName, imageUrl } : null;
  }

  private normalizeMealDetails(nutrition: Prisma.JsonValue | null) {
    if (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition)) {
      return [];
    }

    const record = nutrition as Record<string, Prisma.JsonValue>;
    if (Array.isArray(record.details)) {
      return record.details
        .map((item) => this.normalizeMealDetailItem(item))
        .filter((item): item is { label: string; displayName: string; adminName: string; value: string; icon: string; iconUrl: string } => Boolean(item));
    }

    return [
      this.legacyMealDetail(record.weight, "الوزن التقريبي", "scale"),
      this.legacyMealDetail(record.protein, "نوع البروتين", "drumstick"),
      this.legacyMealDetail(record.breadType, "نوع الخبز", "wheat"),
      this.legacyMealDetail(record.spice, "مستوى الحدة", "flame")
    ].filter((item): item is { label: string; displayName: string; adminName: string; value: string; icon: string; iconUrl: string } => Boolean(item));
  }

  private normalizeMealDetailItem(item: Prisma.JsonValue) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, Prisma.JsonValue>;
    const displayName = typeof record.displayName === "string" ? record.displayName.trim() : "";
    const adminName = typeof record.adminName === "string" ? record.adminName.trim() : "";
    const label = (typeof record.label === "string" ? record.label.trim() : "") || displayName;
    const value = typeof record.value === "string" ? record.value.trim() : "";
    const icon = typeof record.icon === "string" && record.icon.trim() ? record.icon.trim() : "utensils";
    const iconUrl = typeof record.iconUrl === "string" && record.iconUrl.trim() ? this.publicAssetUrl(record.iconUrl.trim()) ?? "" : "";

    return label || value ? { label, displayName: displayName || label, adminName, value, icon, iconUrl } : null;
  }

  private legacyMealDetail(value: Prisma.JsonValue | undefined, label: string, icon: string) {
    const normalizedValue = typeof value === "string" ? value.trim() : "";
    return normalizedValue ? { label, displayName: label, adminName: "", value: normalizedValue, icon, iconUrl: "" } : null;
  }

  private serializeIngredients(ingredients: Prisma.JsonValue | null) {
    if (!Array.isArray(ingredients)) {
      return ingredients ?? [];
    }

    return ingredients.map((item) => {
      const normalized = this.normalizeIngredientItem(item);
      if (!normalized) return item;
      return {
        ...(typeof item === "object" && item && !Array.isArray(item) ? item : {}),
        adminName: normalized.adminName || undefined,
        displayName: normalized.displayName || normalized.name,
        name: normalized.displayName || normalized.name,
        imageUrl: this.publicAssetUrl(normalized.imageUrl) ?? ""
      };
    });
  }

  private serializeNutrition(nutrition: Prisma.JsonValue | null) {
    if (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition)) {
      return nutrition ?? null;
    }

    const record = { ...(nutrition as Record<string, Prisma.JsonValue>) };
    if (Array.isArray(record.details)) {
      record.details = record.details.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const detail = { ...(item as Record<string, Prisma.JsonValue>) };
        if (typeof detail.iconUrl === "string") {
          detail.iconUrl = this.publicAssetUrl(detail.iconUrl) ?? "";
        }
        return detail;
      }) as Prisma.JsonArray;
    }

    return record;
  }

  private clampPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value ?? fallback);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async productViewCounts(restaurantId: string, products: Array<{ id: string; slug: string }>) {
    const counts = new Map<string, number>();
    if (!products.length) return counts;
    const idSet = new Set(products.map((product) => product.id));
    const slugToId = new Map(products.map((product) => [product.slug, product.id]));
    const events = await this.prisma.analyticsEvent.findMany({
      where: { restaurantId, type: "PRODUCT_VIEWED" },
      select: { metadata: true },
      orderBy: { createdAt: "desc" },
      take: 2000
    });

    for (const event of events) {
      const metadata =
        event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
          ? (event.metadata as Record<string, unknown>)
          : {};
      const productId = typeof metadata.productId === "string" ? metadata.productId : null;
      const productSlug = typeof metadata.productSlug === "string" ? metadata.productSlug : null;
      const id = productId && idSet.has(productId) ? productId : productSlug ? slugToId.get(productSlug) : null;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return counts;
  }

  private publicAssetUrl(url?: string | null) {
    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5000}`;
    return publicUploadUrl(url, apiOrigin);
  }

  private infer3dFormat(url: string) {
    const cleanUrl = url.split("?")[0]?.toLowerCase() ?? "";
    if (cleanUrl.endsWith(".usdz")) return "USDZ";
    if (cleanUrl.endsWith(".gltf")) return "GLTF";
    return "GLB";
  }

  private async sync3dMedia(productId: string, dto: CreateProductDto) {
    if (dto.model3dUrl !== undefined) {
      if (dto.model3dUrl) {
        await this.prisma.product3DModel.upsert({
          where: { productId },
          update: {
            url: dto.model3dUrl,
            format: dto.model3dFormat || this.infer3dFormat(dto.model3dUrl),
            isActive: true
          },
          create: {
            productId,
            url: dto.model3dUrl,
            format: dto.model3dFormat || this.infer3dFormat(dto.model3dUrl)
          }
        });
      } else {
        await this.prisma.product3DModel.updateMany({
          where: { productId },
          data: { isActive: false }
        });
      }
    }

    if (dto.vrUrl !== undefined) {
      if (dto.vrUrl) {
        await this.prisma.productVrMedia.upsert({
          where: { productId },
          update: {
            panoramaUrl: dto.vrUrl,
            type: dto.vrType || "PANORAMA",
            isActive: true
          },
          create: {
            productId,
            panoramaUrl: dto.vrUrl,
            type: dto.vrType || "PANORAMA"
          }
        });
      } else {
        await this.prisma.productVrMedia.updateMany({
          where: { productId },
          data: { isActive: false }
        });
      }
    }
  }
}
