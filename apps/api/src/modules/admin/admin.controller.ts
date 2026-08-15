import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { GlobalRoles } from "../../common/global-role.decorator";
import { GlobalRoleGuard } from "../../common/guards/global-role.guard";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CreateRestaurantDto } from "./dto/create-restaurant.dto";
import { AdminService } from "./admin.service";
import { ProductLibraryService } from "../media/product-library.service";
import { UpsertIngredientLibraryItemDto } from "../media/dto/upsert-ingredient-library-item.dto";
import { UpsertMealDetailLibraryItemDto } from "../media/dto/upsert-meal-detail-library-item.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, GlobalRoleGuard)
@GlobalRoles("SUPER_ADMIN")
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(ProductLibraryService) private readonly productLibrary: ProductLibraryService
  ) {}

  @Get("overview")
  overview() {
    return this.adminService.overview();
  }

  @Get("restaurants")
  restaurants() {
    return this.adminService.restaurants();
  }

  @Post("restaurants")
  createRestaurant(@Body() dto: CreateRestaurantDto) {
    return this.adminService.createRestaurant(dto);
  }

  @Patch("restaurants/:id/subscription")
  updateRestaurantSubscription(@Param("id") id: string, @Body() dto: { planKey: string }) {
    return this.adminService.updateRestaurantSubscription(id, dto.planKey);
  }

  @Patch("restaurants/:id/status")
  updateRestaurantStatus(@Param("id") id: string, @Body() dto: { isActive: boolean }) {
    return this.adminService.updateRestaurantStatus(id, dto.isActive);
  }

  @Delete("restaurants/:id")
  deleteRestaurant(@Param("id") id: string) {
    return this.adminService.deleteRestaurantPermanently(id);
  }

  @Get("subscriptions")
  subscriptions() {
    return this.adminService.subscriptions();
  }

  @Post("subscriptions")
  createSubscription(@Body() dto: {
    key?: string;
    name: string;
    priceMonthly?: number | string | null;
    priceYearly?: number | string | null;
    isActive?: boolean;
    features?: Array<{ key: string; enabled?: boolean; limit?: number | string | null }>;
  }) {
    return this.adminService.createSubscriptionPlan(dto);
  }

  @Patch("subscriptions/:id")
  updateSubscription(@Param("id") id: string, @Body() dto: {
    name?: string;
    priceMonthly?: number | string | null;
    priceYearly?: number | string | null;
    isActive?: boolean;
    features?: Array<{ key: string; enabled?: boolean; limit?: number | string | null }>;
  }) {
    return this.adminService.updateSubscriptionPlan(id, dto);
  }

  @Get("library/ingredients")
  libraryIngredients() {
    return this.productLibrary.listIngredients({ includeInactive: true });
  }

  @Post("library/ingredients")
  createLibraryIngredient(@Body() dto: UpsertIngredientLibraryItemDto) {
    return this.productLibrary.createIngredient(dto);
  }

  @Patch("library/ingredients/:id")
  updateLibraryIngredient(@Param("id") id: string, @Body() dto: UpsertIngredientLibraryItemDto) {
    return this.productLibrary.updateIngredient(id, dto);
  }

  @Delete("library/ingredients/:id")
  deleteLibraryIngredient(@Param("id") id: string) {
    return this.productLibrary.deleteIngredient(id);
  }

  @Get("library/meal-details")
  libraryMealDetails() {
    return this.productLibrary.listMealDetails({ includeInactive: true });
  }

  @Post("library/meal-details")
  createLibraryMealDetail(@Body() dto: UpsertMealDetailLibraryItemDto) {
    return this.productLibrary.createMealDetail(dto);
  }

  @Patch("library/meal-details/:id")
  updateLibraryMealDetail(@Param("id") id: string, @Body() dto: UpsertMealDetailLibraryItemDto) {
    return this.productLibrary.updateMealDetail(id, dto);
  }

  @Delete("library/meal-details/:id")
  deleteLibraryMealDetail(@Param("id") id: string) {
    return this.productLibrary.deleteMealDetail(id);
  }
}
