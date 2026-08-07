import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { UpsertIngredientLibraryItemDto } from "./dto/upsert-ingredient-library-item.dto";
import { UpsertMealDetailLibraryItemDto } from "./dto/upsert-meal-detail-library-item.dto";

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
  ingredients(@Req() request: AppRequest) {
    return this.productLibrary.listIngredients(request.restaurant!.id);
  }

  @Post("ingredients")
  createIngredient(@Req() request: AppRequest, @Body() dto: UpsertIngredientLibraryItemDto) {
    return this.productLibrary.createIngredient(request.restaurant!.id, dto);
  }

  @Patch("ingredients/:id")
  updateIngredient(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Body() dto: UpsertIngredientLibraryItemDto
  ) {
    return this.productLibrary.updateIngredient(request.restaurant!.id, id, dto);
  }

  @Delete("ingredients/:id")
  deleteIngredient(@Req() request: AppRequest, @Param("id") id: string) {
    return this.productLibrary.deleteIngredient(request.restaurant!.id, id);
  }

  @Get("meal-details")
  mealDetails(@Req() request: AppRequest) {
    return this.productLibrary.listMealDetails(request.restaurant!.id);
  }

  @Post("meal-details")
  createMealDetail(@Req() request: AppRequest, @Body() dto: UpsertMealDetailLibraryItemDto) {
    return this.productLibrary.createMealDetail(request.restaurant!.id, dto);
  }

  @Patch("meal-details/:id")
  updateMealDetail(
    @Req() request: AppRequest,
    @Param("id") id: string,
    @Body() dto: UpsertMealDetailLibraryItemDto
  ) {
    return this.productLibrary.updateMealDetail(request.restaurant!.id, id, dto);
  }

  @Delete("meal-details/:id")
  deleteMealDetail(@Req() request: AppRequest, @Param("id") id: string) {
    return this.productLibrary.deleteMealDetail(request.restaurant!.id, id);
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
