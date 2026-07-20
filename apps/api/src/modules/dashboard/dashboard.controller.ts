import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AppRequest } from "../../common/app-request";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { DashboardService } from "./dashboard.service";
import { CreateDomainDto } from "./dto/create-domain.dto";
import { ListCategoriesQueryDto } from "./dto/list-categories-query.dto";
import { ReorderCategoriesDto } from "./dto/reorder-categories.dto";
import { UpdateDashboardSettingsDto } from "./dto/update-dashboard-settings.dto";
import { UpdateThemeDto } from "./dto/update-theme.dto";
import { UpsertBranchDto } from "./dto/upsert-branch.dto";
import { UpsertDashboardBannerDto } from "./dto/upsert-dashboard-banner.dto";
import { UpsertCategoryDto } from "./dto/upsert-category.dto";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @Get("restaurants/current")
  currentRestaurant(@Req() request: AppRequest) {
    return this.dashboardService.currentRestaurant(request.restaurant!.id);
  }

  @Get("overview")
  overview(@Req() request: AppRequest) {
    return this.dashboardService.overview(request.restaurant!.id);
  }

  @Get("branches")
  branches(@Req() request: AppRequest) {
    return this.dashboardService.branches(request.restaurant!.id);
  }

  @Post("branches")
  createBranch(@Req() request: AppRequest, @Body() dto: UpsertBranchDto) {
    return this.dashboardService.createBranch(request.restaurant!.id, dto);
  }

  @Patch("branches/:id")
  updateBranch(@Req() request: AppRequest, @Param("id") id: string, @Body() dto: UpsertBranchDto) {
    return this.dashboardService.updateBranch(request.restaurant!.id, id, dto);
  }

  @Delete("branches/:id")
  deleteBranch(@Req() request: AppRequest, @Param("id") id: string) {
    return this.dashboardService.deleteBranch(request.restaurant!.id, id);
  }

  @Get("categories")
  categories(@Req() request: AppRequest, @Query() query: ListCategoriesQueryDto) {
    return this.dashboardService.categories(request.restaurant!.id, query);
  }

  @Post("categories")
  createCategory(@Req() request: AppRequest, @Body() dto: UpsertCategoryDto) {
    return this.dashboardService.createCategory(request.restaurant!.id, dto);
  }

  @Get("categories/:id")
  category(@Req() request: AppRequest, @Param("id") id: string) {
    return this.dashboardService.category(request.restaurant!.id, id);
  }

  @Patch("categories/reorder")
  reorderCategories(@Req() request: AppRequest, @Body() dto: ReorderCategoriesDto) {
    return this.dashboardService.reorderCategories(request.restaurant!.id, dto.items);
  }

  @Patch("categories/:id")
  updateCategory(@Req() request: AppRequest, @Param("id") id: string, @Body() dto: UpsertCategoryDto) {
    return this.dashboardService.updateCategory(request.restaurant!.id, id, dto);
  }

  @Delete("categories/:id")
  deleteCategory(@Req() request: AppRequest, @Param("id") id: string) {
    return this.dashboardService.deleteCategory(request.restaurant!.id, id);
  }

  @Get("theme")
  theme(@Req() request: AppRequest) {
    return this.dashboardService.theme(request.restaurant!.id);
  }

  @Get("domains")
  domains(@Req() request: AppRequest) {
    return this.dashboardService.domains(request.restaurant!.id);
  }

  @Post("domains")
  createDomain(@Req() request: AppRequest, @Body() dto: CreateDomainDto) {
    return this.dashboardService.createDomain(request.restaurant!.id, dto);
  }

  @Post("domains/:id/verify")
  verifyDomain(@Req() request: AppRequest, @Param("id") id: string) {
    return this.dashboardService.verifyDomain(request.restaurant!.id, id);
  }

  @Delete("domains/:id")
  disableDomain(@Req() request: AppRequest, @Param("id") id: string) {
    return this.dashboardService.disableDomain(request.restaurant!.id, id);
  }

  @Patch("theme")
  updateTheme(@Req() request: AppRequest, @Body() dto: UpdateThemeDto) {
    return this.dashboardService.updateTheme(request.restaurant!.id, dto);
  }

  @Get("analytics")
  analytics(@Req() request: AppRequest) {
    return this.dashboardService.analytics(request.restaurant!.id);
  }

  @Get("banners")
  banners(@Req() request: AppRequest) {
    return this.dashboardService.banners(request.restaurant!.id);
  }

  @Post("banners")
  createBanner(@Req() request: AppRequest, @Body() dto: UpsertDashboardBannerDto) {
    return this.dashboardService.createBanner(request.restaurant!.id, dto);
  }

  @Patch("banners/:id")
  updateBanner(@Req() request: AppRequest, @Param("id") id: string, @Body() dto: UpsertDashboardBannerDto) {
    return this.dashboardService.updateBanner(request.restaurant!.id, id, dto);
  }

  @Delete("banners/:id")
  deleteBanner(@Req() request: AppRequest, @Param("id") id: string) {
    return this.dashboardService.deleteBanner(request.restaurant!.id, id);
  }

  @Get("settings")
  settings(@Req() request: AppRequest) {
    return this.dashboardService.settings(request.restaurant!.id);
  }

  @Patch("settings")
  updateSettings(@Req() request: AppRequest, @Body() dto: UpdateDashboardSettingsDto) {
    return this.dashboardService.updateSettings(request.restaurant!.id, dto);
  }
}
