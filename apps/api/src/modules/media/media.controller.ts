import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { randomUUID } from "crypto";
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
import { ProductLibraryService } from "./product-library.service";
import {
  MediaStorageService,
  uploadMaxBytes,
  validateUploadFile
} from "./media-storage.service";

@Controller("dashboard/media")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(MediaStorageService) private readonly storage: MediaStorageService,
    @Inject(ProductLibraryService) private readonly productLibrary: ProductLibraryService
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

  @Get("ingredients")
  ingredients() {
    return this.productLibrary.listIngredients();
  }

  @Post("ingredients")
  createIngredient() {
    throw new ForbiddenException("Only SUPER_ADMIN can manage the global library");
  }

  @Patch("ingredients/:id")
  updateIngredient() {
    throw new ForbiddenException("Only SUPER_ADMIN can manage the global library");
  }

  @Delete("ingredients/:id")
  deleteIngredient() {
    throw new ForbiddenException("Only SUPER_ADMIN can manage the global library");
  }

  @Get("meal-details")
  mealDetails() {
    return this.productLibrary.listMealDetails();
  }

  @Post("meal-details")
  createMealDetail() {
    throw new ForbiddenException("Only SUPER_ADMIN can manage the global library");
  }

  @Patch("meal-details/:id")
  updateMealDetail() {
    throw new ForbiddenException("Only SUPER_ADMIN can manage the global library");
  }

  @Delete("meal-details/:id")
  deleteMealDetail() {
    throw new ForbiddenException("Only SUPER_ADMIN can manage the global library");
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
          callback(null, `${Date.now()}-${randomUUID()}-${safeBase || "asset"}${extname(file.originalname).toLowerCase()}`);
        }
      }),
      fileFilter: (_request, file, callback) => {
        try {
          validateUploadFile(file);
          callback(null, true);
        } catch (error) {
          callback(error instanceof BadRequestException ? error : new BadRequestException("Unsupported upload type"), false);
        }
      },
      limits: { fileSize: uploadMaxBytes, files: 1 }
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

    const upload = await this.storage.storeUploadedFile(file, body.type);

    return this.mediaService.create(request.restaurant!.id, request.user?.sub, {
      url: upload.url,
      type: body.type ?? this.mediaService.inferMediaType(file.originalname),
      altText: body.altText ?? file.originalname,
      size: upload.size,
      filename: upload.filename,
      originalFilename: upload.originalFilename,
      mimeType: upload.mimeType,
      provider: upload.provider,
      metadata: upload.metadata
    });
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
