import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { GlobalRoles } from "../../common/global-role.decorator";
import { GlobalRoleGuard } from "../../common/guards/global-role.guard";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CreateRestaurantDto } from "./dto/create-restaurant.dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, GlobalRoleGuard)
@GlobalRoles("SUPER_ADMIN")
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

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
}
