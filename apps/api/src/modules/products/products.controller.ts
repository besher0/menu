import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AppRequest } from "../../common/app-request";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { ReorderProductsDto } from "./dto/reorder-products.dto";
import { UpdateProductSortDto } from "./dto/update-product-sort.dto";
import { ProductsService } from "./products.service";

@Controller("dashboard/products")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly productsService: ProductsService) {}

  @Get()
  list(@Req() request: AppRequest, @Query() query: ListProductsQueryDto) {
    return this.productsService.list(request.restaurant!.id, query);
  }

  @Post()
  create(@Req() request: AppRequest, @Body() dto: CreateProductDto) {
    return this.productsService.create(request.restaurant!.id, dto);
  }

  @Patch("reorder")
  reorder(@Req() request: AppRequest, @Body() dto: ReorderProductsDto) {
    return this.productsService.reorder(request.restaurant!.id, dto.items);
  }

  @Get(":id")
  findOne(@Req() request: AppRequest, @Param("id") id: string) {
    return this.productsService.findOne(request.restaurant!.id, id);
  }

  @Patch(":id")
  update(@Req() request: AppRequest, @Param("id") id: string, @Body() dto: CreateProductDto) {
    return this.productsService.update(request.restaurant!.id, id, dto);
  }

  @Patch(":id/toggle-availability")
  toggleAvailability(@Req() request: AppRequest, @Param("id") id: string) {
    return this.productsService.toggleAvailability(request.restaurant!.id, id);
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
