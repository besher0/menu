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

  async create(restaurantId: string, dto: CreateProductDto) {
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

    const product = await this.prisma.product.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        slug: dto.slug ? slugify(dto.slug) : slugify(dto.name),
        description: dto.description,
        basePrice: dto.basePrice,
        currency: dto.currency ?? "ل.س",
        ingredients: dto.ingredients as Prisma.InputJsonValue | undefined,
        nutrition: dto.nutrition as Prisma.InputJsonValue | undefined,
        isFeatured: dto.isFeatured ?? false,
        isNew: dto.isNew ?? dto.isFeatured ?? false,
        isPopular: dto.isPopular ?? false,
        media3d: dto.model3dUrl
          ? {
              create: {
                url: dto.model3dUrl,
                format: dto.model3dFormat || this.infer3dFormat(dto.model3dUrl)
              }
            }
          : undefined,
        vrMedia: dto.vrUrl
          ? {
              create: {
                panoramaUrl: dto.vrUrl,
                type: dto.vrType || "PANORAMA"
              }
            }
          : undefined,
        images: dto.imageUrl
          ? {
              create: {
                url: dto.imageUrl,
                altText: dto.name
              }
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

  async update(restaurantId: string, id: string, dto: CreateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null },
      include: {
        images: { where: { isActive: true }, orderBy: { sortOrder: "asc" } }
      }
    });

    if (!existing) {
      throw new NotFoundException("Product not found");
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        categoryId: dto.categoryId || null,
        name: dto.name,
        slug: dto.slug ? slugify(dto.slug) : existing.slug,
        description: dto.description,
        basePrice: dto.basePrice,
        currency: dto.currency ?? existing.currency,
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

    if (dto.imageUrl && dto.imageUrl !== existing.images[0]?.url) {
      if (existing.images[0]) {
        await this.prisma.productImage.update({
          where: { id: existing.images[0].id },
          data: { url: dto.imageUrl, altText: dto.name }
        });
      } else {
        await this.prisma.productImage.create({
          data: {
            productId: id,
            url: dto.imageUrl,
            altText: dto.name,
            sortOrder: 0
          }
        });
      }
    }

    await this.sync3dMedia(id, dto);

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
      sortOrder: product.sortOrder,
      views,
      ingredients: product.ingredients ?? [],
      nutrition: product.nutrition ?? null,
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

    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5010}`;

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
