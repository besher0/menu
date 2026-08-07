import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { AppRequest } from "../../common/app-request";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { PRODUCT_IMPORT_LIMITS } from "./import/product-import-parser";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { ReorderProductsDto } from "./dto/reorder-products.dto";
import { UpdateProductPriceDto } from "./dto/update-product-price.dto";
import { UpdateProductSortDto } from "./dto/update-product-sort.dto";
import { ProductsImportService } from "./products-import.service";
import { ProductsService } from "./products.service";

const excelUploadOptions = () => ({
  storage: memoryStorage(),
  fileFilter: (_request: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => {
    if (!file.originalname.toLocaleLowerCase().endsWith(".xlsx")) {
      callback(new BadRequestException("الملف يجب أن يكون بصيغة .xlsx"), false);
      return;
    }

    callback(null, true);
  },
  limits: { fileSize: PRODUCT_IMPORT_LIMITS.maxFileBytes, files: 1 }
});

@Controller("dashboard/products")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class ProductsController {
  constructor(
    @Inject(ProductsService) private readonly productsService: ProductsService,
    @Inject(ProductsImportService) private readonly productsImportService: ProductsImportService
  ) {}

  @Get()
  list(@Req() request: AppRequest, @Query() query: ListProductsQueryDto) {
    return this.productsService.list(request.restaurant!.id, query);
  }

  @Post()
  create(@Req() request: AppRequest, @Body() dto: CreateProductDto) {
    return this.productsService.create(request.restaurant!.id, dto, request.user?.role === "SUPER_ADMIN");
  }

  @Get("import/template")
  importTemplate(@Req() request: AppRequest) {
    return this.productsImportService.template(request.restaurant!.id);
  }

  @Post("import/preview")
  @UseInterceptors(FileInterceptor("file", excelUploadOptions()))
  importPreview(@Req() request: AppRequest, @UploadedFile() file: Express.Multer.File) {
    return this.productsImportService.preview(request.restaurant!.id, file);
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file", excelUploadOptions()))
  importProducts(@Req() request: AppRequest, @UploadedFile() file: Express.Multer.File) {
    return this.productsImportService.import(request.restaurant!.id, request.user?.sub, file);
  }

  @Patch("reorder")
  reorder(@Req() request: AppRequest, @Body() dto: ReorderProductsDto) {
    return this.productsService.reorder(request.restaurant!.id, dto.items);
  }

  @Get("ingredients")
  ingredients(@Req() request: AppRequest) {
    return this.productsService.ingredients(request.restaurant!.id);
  }

  @Get("meal-details")
  mealDetails(@Req() request: AppRequest) {
    return this.productsService.mealDetails(request.restaurant!.id);
  }

  @Get(":id")
  findOne(@Req() request: AppRequest, @Param("id") id: string) {
    return this.productsService.findOne(request.restaurant!.id, id);
  }

  @Patch(":id")
  update(@Req() request: AppRequest, @Param("id") id: string, @Body() dto: CreateProductDto) {
    return this.productsService.update(request.restaurant!.id, id, dto, request.user?.role === "SUPER_ADMIN");
  }

  @Patch(":id/toggle-availability")
  toggleAvailability(@Req() request: AppRequest, @Param("id") id: string) {
    return this.productsService.toggleAvailability(request.restaurant!.id, id);
  }

  @Patch(":id/price")
  updatePrice(@Req() request: AppRequest, @Param("id") id: string, @Body() dto: UpdateProductPriceDto) {
    return this.productsService.updatePrice(request.restaurant!.id, id, dto.basePrice);
  }

  @Patch(":id/sort-order")
  updateSortOrder(@Req() request: AppRequest, @Param("id") id: string, @Body() dto: UpdateProductSortDto) {
    return this.productsService.updateSortOrder(request.restaurant!.id, id, dto.sortOrder);
  }

  @Delete(":id")
  delete(@Req() request: AppRequest, @Param("id") id: string) {
    return this.productsService.delete(request.restaurant!.id, id);
  }
}
