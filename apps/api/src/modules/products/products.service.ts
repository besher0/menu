import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { slugify } from "../../common/slugify";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsQueryDto } from "./dto/list-products-query.dto";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async list(restaurantId: string, query: ListProductsQueryDto = {}) {
    const page = this.clampPositiveInt(query.page, 1);
    const limit = Math.min(this.clampPositiveInt(query.limit, 20), 100);
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
        skip: (page - 1) * limit,
        take: limit
      })
    ]);
    const views = await this.productViewCounts(
      restaurantId,
      products.map((product) => ({ id: product.id, slug: product.slug }))
    );

    return {
      data: products.map((product) => this.serializeProduct(product, views.get(product.id) ?? 0)),
      meta: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async create(restaurantId: string, dto: CreateProductDto, allowAdvancedMedia = false) {
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

    const product = await this.prisma.product.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        slug: productSlug,
        description: dto.description,
        basePrice: dto.basePrice,
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
    });

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
    const products = await this.prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      select: { ingredients: true },
      orderBy: { updatedAt: "desc" },
      take: 500
    });
    const ingredients = new Map<string, { name: string; imageUrl: string; usageCount: number }>();

    for (const product of products) {
      if (!Array.isArray(product.ingredients)) continue;

      for (const item of product.ingredients) {
        const normalized = this.normalizeIngredientItem(item);
        if (!normalized) continue;

        const key = normalized.name.toLocaleLowerCase();
        const imageUrl = this.publicAssetUrl(normalized.imageUrl) ?? "";
        const existing = ingredients.get(key);
        if (existing) {
          existing.usageCount += 1;
          if (!existing.imageUrl && imageUrl) {
            existing.imageUrl = imageUrl;
          }
        } else {
          ingredients.set(key, { name: normalized.name, imageUrl, usageCount: 1 });
        }
      }
    }

    return {
      data: Array.from(ingredients.values())
        .sort((left, right) => right.usageCount - left.usageCount || left.name.localeCompare(right.name, "ar"))
        .slice(0, 200)
    };
  }

  async mealDetails(restaurantId: string) {
    const products = await this.prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      select: { nutrition: true },
      orderBy: { updatedAt: "desc" },
      take: 500
    });
    const details = new Map<string, { label: string; value: string; icon: string; usageCount: number }>();

    for (const product of products) {
      for (const detail of this.normalizeMealDetails(product.nutrition)) {
        const key = `${detail.label.toLocaleLowerCase()}|${detail.value.toLocaleLowerCase()}|${detail.icon}|${detail.iconUrl.toLocaleLowerCase()}`;
        const existing = details.get(key);
        if (existing) {
          existing.usageCount += 1;
        } else {
          details.set(key, { ...detail, usageCount: 1 });
        }
      }
    }

    return {
      data: Array.from(details.values())
        .sort((left, right) => right.usageCount - left.usageCount || left.label.localeCompare(right.label, "ar"))
        .slice(0, 200)
    };
  }

  async update(restaurantId: string, id: string, dto: CreateProductDto, allowAdvancedMedia = false) {
    const existing = await this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null },
      include: {
        images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } }
      }
    });

    if (!existing) {
      throw new NotFoundException("Product not found");
    }

    const productSlug = dto.slug ? await this.uniqueProductSlug(restaurantId, dto.slug, id) : existing.slug;

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        categoryId: dto.categoryId || null,
        name: dto.name,
        slug: productSlug,
        description: dto.description,
        basePrice: dto.basePrice,
        currency: dto.currency ?? existing.currency,
        moodKey: this.serializeMoodKeyValue(this.normalizeMoodKeysInput(dto)),
        ingredients: dto.ingredients as Prisma.InputJsonValue | undefined,
        nutrition: dto.nutrition as Prisma.InputJsonValue | undefined,
        isFeatured: dto.isFeatured ?? dto.isNew ?? existing.isFeatured,
        isNew: dto.isNew ?? dto.isFeatured ?? existing.isNew,
        isPopular: dto.isPopular ?? existing.isPopular
      },
      include: {
        category: true,
        images: true,
        media3d: true,
        vrMedia: true,
        options: { include: { options: true } }
      }
    });

    if (dto.images !== undefined || dto.imageUrl !== undefined) {
      await this.syncProductImages(id, dto);
    }

    if (allowAdvancedMedia) {
      await this.sync3dMedia(id, dto);
    }

    return this.findOne(restaurantId, id);
  }

  async toggleAvailability(restaurantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { isAvailable: !product.isAvailable },
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

  async reorder(restaurantId: string, items: Array<{ id: string; sortOrder: number }>) {
    const products = await this.prisma.product.findMany({
      where: { restaurantId, id: { in: items.map((item) => item.id) }, deletedAt: null },
      select: { id: true }
    });
    const ownedIds = new Set(products.map((product) => product.id));

    if (ownedIds.size !== items.length) {
      throw new NotFoundException("One or more products were not found");
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.product.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder }
        })
      )
    );

    return this.list(restaurantId, { page: 1, limit: Math.max(items.length, 20), sort: "sortOrder" });
  }

  async delete(restaurantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        isActive: false,
        isAvailable: false,
        deletedAt: new Date()
      }
    });

    return { deleted: true };
  }

  private serializeProduct(product: any, views = 0) {
    const moodKeys = this.parseStoredMoodKeys(product.moodKey);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      basePrice: Number(product.basePrice),
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
      ingredients: product.ingredients ?? [],
      nutrition: this.serializeNutrition(product.nutrition),
      category: product.category
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
    return [{ sortOrder: "asc" }, { createdAt: "desc" }];
  }

  private productImageInputs(dto: CreateProductDto) {
    const images = dto.images?.length
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

  private async uniqueProductSlug(restaurantId: string, value: string, excludeId?: string) {
    const base = slugify(value) || "product";
    let candidate = base;
    let suffix = 2;

    while (await this.prisma.product.findFirst({
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

  private async syncProductImages(productId: string, dto: CreateProductDto) {
    const images = this.productImageInputs(dto);

    await this.prisma.productImage.deleteMany({ where: { productId } });

    if (!images.length) {
      return;
    }

    await this.prisma.productImage.createMany({
      data: images.map((image, index) => ({
        productId,
        url: image.url,
        altText: image.altText,
        sortOrder: index
      }))
    });
  }

  private normalizeIngredientItem(item: Prisma.JsonValue) {
    if (typeof item === "string") {
      const name = item.trim();
      return name ? { name, imageUrl: "" } : null;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, Prisma.JsonValue>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";

    return name ? { name, imageUrl } : null;
  }

  private normalizeMealDetails(nutrition: Prisma.JsonValue | null) {
    if (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition)) {
      return [];
    }

    const record = nutrition as Record<string, Prisma.JsonValue>;
    if (Array.isArray(record.details)) {
      return record.details
        .map((item) => this.normalizeMealDetailItem(item))
        .filter((item): item is { label: string; value: string; icon: string; iconUrl: string } => Boolean(item));
    }

    return [
      this.legacyMealDetail(record.weight, "الوزن التقريبي", "scale"),
      this.legacyMealDetail(record.protein, "نوع البروتين", "drumstick"),
      this.legacyMealDetail(record.breadType, "نوع الخبز", "wheat"),
      this.legacyMealDetail(record.spice, "مستوى الحدة", "flame")
    ].filter((item): item is { label: string; value: string; icon: string; iconUrl: string } => Boolean(item));
  }

  private normalizeMealDetailItem(item: Prisma.JsonValue) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, Prisma.JsonValue>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const value = typeof record.value === "string" ? record.value.trim() : "";
    const icon = typeof record.icon === "string" && record.icon.trim() ? record.icon.trim() : "utensils";
    const iconUrl = typeof record.iconUrl === "string" && record.iconUrl.trim() ? this.publicAssetUrl(record.iconUrl.trim()) ?? "" : "";

    return label || value ? { label, value, icon, iconUrl } : null;
  }

  private legacyMealDetail(value: Prisma.JsonValue | undefined, label: string, icon: string) {
    const normalizedValue = typeof value === "string" ? value.trim() : "";
    return normalizedValue ? { label, value: normalizedValue, icon, iconUrl: "" } : null;
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
    if (!url) {
      return null;
    }

    if (!url.includes("/uploads/")) {
      return url;
    }

    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5000}`;

    if (url.startsWith("/uploads/")) {
      return `${apiOrigin}${url}`;
    }

    try {
      const parsedUrl = new URL(url);
      return `${apiOrigin}${parsedUrl.pathname}${parsedUrl.search}`;
    } catch {
      return url;
    }
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
