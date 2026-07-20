import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { MediaType, MediaVariantKind } from "@prisma/client";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AttachProduct3dDto,
  AttachProductImageDto,
  AttachProductVrDto
} from "./dto/attach-product-media.dto";
import { CreateMediaAssetDto } from "./dto/create-media-asset.dto";
import { UpsertImageRuleDto } from "./dto/upsert-image-rule.dto";

@Injectable()
export class MediaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService
  ) {}

  async list(restaurantId: string, type?: string) {
    const parsedType = this.parseType(type);

    return this.prisma.mediaAsset.findMany({
      where: {
        restaurantId,
        ...(parsedType ? { type: parsedType } : {})
      },
      include: {
        variants: { orderBy: { kind: "asc" } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(restaurantId: string, createdById: string | undefined, dto: CreateMediaAssetDto) {
    await this.assertMediaFeature(restaurantId, dto.type);
    const variants = this.buildVariants(dto);

    return this.prisma.mediaAsset.create({
      data: {
        restaurantId,
        createdById,
        filename: dto.filename ?? this.filenameFromUrl(dto.url),
        originalFilename: dto.originalFilename ?? dto.filename ?? this.filenameFromUrl(dto.url),
        mimeType: dto.mimeType ?? this.inferMimeType(dto.url, dto.type),
        url: dto.url,
        originalUrl: dto.url,
        type: dto.type,
        size: dto.size,
        width: dto.width,
        height: dto.height,
        altText: dto.altText,
        blurDataUrl: dto.type === "IMAGE" ? this.buildBlurPlaceholder(dto.url) : undefined,
        metadata: {
          responsive: dto.type === "IMAGE",
          progressive: dto.type === "IMAGE",
          source: "media-engine-v1"
        },
        variants: variants.length
          ? {
              create: variants
            }
          : undefined
      },
      include: { variants: true }
    });
  }

  rules(restaurantId: string) {
    return this.prisma.imageRule.findMany({
      where: {
        OR: [{ restaurantId }, { restaurantId: null }]
      },
      orderBy: [{ restaurantId: "asc" }, { target: "asc" }]
    });
  }

  upsertRule(restaurantId: string, dto: UpsertImageRuleDto) {
    return this.prisma.imageRule.upsert({
      where: {
        restaurantId_target: {
          restaurantId,
          target: dto.target
        }
      },
      update: {
        maxWidth: dto.maxWidth,
        maxHeight: dto.maxHeight,
        jpegQuality: dto.jpegQuality,
        webpQuality: dto.webpQuality,
        cropMode: dto.cropMode,
        aspectRatio: dto.aspectRatio,
        generateAvif: dto.generateAvif,
        generateWebp: dto.generateWebp,
        lazyLoad: dto.lazyLoad,
        progressive: dto.progressive
      },
      create: {
        restaurantId,
        target: dto.target,
        maxWidth: dto.maxWidth,
        maxHeight: dto.maxHeight,
        jpegQuality: dto.jpegQuality ?? 82,
        webpQuality: dto.webpQuality ?? 82,
        cropMode: dto.cropMode ?? "contain",
        aspectRatio: dto.aspectRatio,
        generateAvif: dto.generateAvif ?? true,
        generateWebp: dto.generateWebp ?? true,
        lazyLoad: dto.lazyLoad ?? true,
        progressive: dto.progressive ?? true
      }
    });
  }

  async attachImage(restaurantId: string, productId: string, dto: AttachProductImageDto) {
    await this.featureFlags.assertFeature(restaurantId, "PRODUCT_IMAGES");
    await this.findProduct(restaurantId, productId);

    const count = await this.prisma.productImage.count({ where: { productId } });

    return this.prisma.productImage.create({
      data: {
        productId,
        mediaId: dto.mediaId,
        url: dto.url,
        altText: dto.altText,
        sortOrder: count
      }
    });
  }

  async attach3d(restaurantId: string, productId: string, dto: AttachProduct3dDto) {
    await this.featureFlags.assertFeature(restaurantId, "PRODUCT_3D_VIEWER");
    await this.findProduct(restaurantId, productId);

    return this.prisma.product3DModel.upsert({
      where: { productId },
      create: {
        productId,
        url: dto.url,
        format: dto.format ?? this.inferFormat(dto.url)
      },
      update: {
        url: dto.url,
        format: dto.format ?? this.inferFormat(dto.url),
        isActive: true
      }
    });
  }

  async attachVr(restaurantId: string, productId: string, dto: AttachProductVrDto) {
    await this.featureFlags.assertFeature(restaurantId, "PRODUCT_VR_VIEWER");
    await this.findProduct(restaurantId, productId);

    return this.prisma.productVrMedia.upsert({
      where: { productId },
      create: {
        productId,
        panoramaUrl: dto.panoramaUrl,
        type: dto.type ?? "equirectangular"
      },
      update: {
        panoramaUrl: dto.panoramaUrl,
        type: dto.type ?? "equirectangular",
        isActive: true
      }
    });
  }

  private async assertMediaFeature(restaurantId: string, type: CreateMediaAssetDto["type"]) {
    if (type === "IMAGE") {
      await this.featureFlags.assertFeature(restaurantId, "PRODUCT_IMAGES");
    }

    if (type === "MODEL_3D") {
      await this.featureFlags.assertFeature(restaurantId, "PRODUCT_3D_VIEWER");
    }

    if (type === "VR_PANORAMA") {
      await this.featureFlags.assertFeature(restaurantId, "PRODUCT_VR_VIEWER");
    }
  }

  private async findProduct(restaurantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, restaurantId, deletedAt: null }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return product;
  }

  private parseType(type?: string) {
    if (!type) {
      return undefined;
    }

    if (!["IMAGE", "MODEL_3D", "VR_PANORAMA", "SVG_ICON", "PNG_ICON"].includes(type)) {
      throw new BadRequestException("Invalid media type");
    }

    return type as MediaType;
  }

  inferMediaType(filename: string): "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON" {
    const extension = filename.split("?")[0].split(".").pop()?.toLowerCase();

    if (extension && ["glb", "gltf"].includes(extension)) {
      return "MODEL_3D";
    }

    if (extension === "svg") {
      return "SVG_ICON";
    }

    if (extension && ["jpg", "jpeg", "png", "webp", "avif"].includes(extension)) {
      return extension === "png" && filename.toLowerCase().includes("icon") ? "PNG_ICON" : "IMAGE";
    }

    return "VR_PANORAMA";
  }

  private inferFormat(url: string) {
    const extension = url.split("?")[0].split(".").pop()?.toLowerCase();
    return extension && ["glb", "gltf"].includes(extension) ? extension : "glb";
  }

  private buildVariants(dto: CreateMediaAssetDto) {
    if (dto.type !== "IMAGE" && dto.type !== "PNG_ICON") {
      return [];
    }

    const baseFormat = this.filenameFromUrl(dto.url).split(".").pop()?.toLowerCase() || "jpg";
    const variants: Array<{
      kind: MediaVariantKind;
      url: string;
      width?: number;
      height?: number;
      size?: number;
      format: string;
      quality?: number;
    }> = [
      {
        kind: "ORIGINAL",
        url: dto.url,
        width: dto.width,
        height: dto.height,
        size: dto.size,
        format: baseFormat,
        quality: 100
      },
      ...this.responsiveVariant("THUMBNAIL", dto, 200, baseFormat, 78),
      ...this.responsiveVariant("SMALL", dto, 640, baseFormat, 80),
      ...this.responsiveVariant("MEDIUM", dto, 1280, baseFormat, 82),
      ...this.responsiveVariant("LARGE", dto, 1920, baseFormat, 84),
      ...this.responsiveVariant("WEBP", dto, 1280, "webp", 82),
      ...this.responsiveVariant("AVIF", dto, 1280, "avif", 72),
      {
        kind: "BLUR",
        url: this.variantUrl(dto.url, "blur", "jpg"),
        width: 40,
        height: this.scaledHeight(dto, 40),
        format: "jpg",
        quality: 45
      }
    ];

    return variants;
  }

  private responsiveVariant(kind: MediaVariantKind, dto: CreateMediaAssetDto, width: number, format: string, quality: number) {
    return [
      {
        kind,
        url: this.variantUrl(dto.url, kind.toLowerCase(), format),
        width,
        height: this.scaledHeight(dto, width),
        format,
        quality
      }
    ];
  }

  private variantUrl(url: string, suffix: string, format: string) {
    const clean = url.split("?")[0];
    const extension = clean.split(".").pop();
    if (!extension || clean === url && !url.includes(".")) {
      return `${url}.${suffix}.${format}`;
    }

    return clean.replace(new RegExp(`\\.${extension}$`), `.${suffix}.${format}`);
  }

  private scaledHeight(dto: CreateMediaAssetDto, width: number) {
    if (!dto.width || !dto.height || dto.width <= 0) {
      return undefined;
    }

    return Math.round((dto.height / dto.width) * width);
  }

  private buildBlurPlaceholder(url: string) {
    return this.variantUrl(url, "blur", "jpg");
  }

  private filenameFromUrl(url: string) {
    return decodeURIComponent(url.split("?")[0].split("/").pop() || "asset");
  }

  private inferMimeType(url: string, type: CreateMediaAssetDto["type"]) {
    const extension = this.filenameFromUrl(url).split(".").pop()?.toLowerCase();

    if (type === "MODEL_3D") {
      return extension === "gltf" ? "model/gltf+json" : "model/gltf-binary";
    }

    if (type === "SVG_ICON") {
      return "image/svg+xml";
    }

    if (extension === "png") return "image/png";
    if (extension === "webp") return "image/webp";
    if (extension === "avif") return "image/avif";
    return "image/jpeg";
  }
}
