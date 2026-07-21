import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { createHash } from "crypto";
import { readFile, unlink } from "fs/promises";
import { diskStorage } from "multer";
import { extname } from "path";
import { AppRequest } from "../../common/app-request";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import {
  AttachProduct3dDto,
  AttachProductImageDto,
  AttachProductVrDto
} from "./dto/attach-product-media.dto";
import { CreateMediaAssetDto } from "./dto/create-media-asset.dto";
import { UpsertImageRuleDto } from "./dto/upsert-image-rule.dto";
import { MediaService } from "./media.service";

@Controller("dashboard/media")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  @Get()
  list(@Req() request: AppRequest, @Query("type") type?: string) {
    return this.mediaService.list(request.restaurant!.id, type);
  }

  @Get("rules")
  rules(@Req() request: AppRequest) {
    return this.mediaService.rules(request.restaurant!.id);
  }

  @Post("rules")
  upsertRule(@Req() request: AppRequest, @Body() dto: UpsertImageRuleDto) {
    return this.mediaService.upsertRule(request.restaurant!.id, dto);
  }

  @Post()
  create(@Req() request: AppRequest, @Body() dto: CreateMediaAssetDto) {
    return this.mediaService.create(request.restaurant!.id, request.user?.sub, dto);
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "uploads",
        filename: (_request, file, callback) => {
          const safeBase = file.originalname
            .replace(extname(file.originalname), "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 48);
          callback(null, `${Date.now()}-${safeBase || "asset"}${extname(file.originalname).toLowerCase()}`);
        }
      }),
      limits: { fileSize: 75 * 1024 * 1024 }
    })
  )
  async upload(
    @Req() request: AppRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON"; altText?: string }
  ) {
    if (!file) {
      throw new BadRequestException("Upload file is required");
    }

    const cloudinaryUrl = await this.uploadToCloudinaryIfConfigured(file, body.type);
    const apiOrigin = this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5010}`;

    return this.mediaService.create(request.restaurant!.id, request.user?.sub, {
      url: cloudinaryUrl ?? `${apiOrigin}/uploads/${file.filename}`,
      type: body.type ?? this.mediaService.inferMediaType(file.originalname),
      altText: body.altText ?? file.originalname,
      size: file.size,
      filename: file.filename,
      originalFilename: file.originalname,
      mimeType: file.mimetype
    });
  }

  private async uploadToCloudinaryIfConfigured(
    file: Express.Multer.File,
    type?: "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON"
  ) {
    const cloudName = this.config.get<string>("CLOUDINARY_CLOUD_NAME");
    const apiKey = this.config.get<string>("CLOUDINARY_API_KEY");
    const apiSecret = this.config.get<string>("CLOUDINARY_API_SECRET");

    if (!cloudName || !apiKey || !apiSecret) {
      if (type === "MODEL_3D") {
        await unlink(file.path).catch(() => undefined);
        throw new BadRequestException("Cloudinary is required for 3D uploads. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
      }

      return null;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = this.config.get<string>("CLOUDINARY_FOLDER") ?? "menu-builder";
      const resourceType = type === "IMAGE" || type === "SVG_ICON" || type === "PNG_ICON" ? "image" : "raw";
      const signature = createHash("sha1")
        .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
        .digest("hex");
      const buffer = await readFile(file.path);
      const formData = new FormData();

      formData.append("file", new Blob([buffer], { type: file.mimetype }), file.originalname);
      formData.append("api_key", apiKey);
      formData.append("timestamp", String(timestamp));
      formData.append("folder", folder);
      formData.append("signature", signature);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => null) as { secure_url?: string; error?: { message?: string } } | null;

      if (!response.ok || !payload?.secure_url) {
        throw new BadRequestException(payload?.error?.message ?? "Cloudinary upload failed");
      }

      return payload.secure_url;
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Post("products/:productId/images")
  attachImage(
    @Req() request: AppRequest,
    @Param("productId") productId: string,
    @Body() dto: AttachProductImageDto
  ) {
    return this.mediaService.attachImage(request.restaurant!.id, productId, dto);
  }

  @Post("products/:productId/3d")
  attach3d(
    @Req() request: AppRequest,
    @Param("productId") productId: string,
    @Body() dto: AttachProduct3dDto
  ) {
    return this.mediaService.attach3d(request.restaurant!.id, productId, dto);
  }

  @Post("products/:productId/vr")
  attachVr(
    @Req() request: AppRequest,
    @Param("productId") productId: string,
    @Body() dto: AttachProductVrDto
  ) {
    return this.mediaService.attachVr(request.restaurant!.id, productId, dto);
  }
}
