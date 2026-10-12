import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { AppRequest } from "../../common/app-request";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { OrdersService } from "./orders.service";

@Controller("dashboard/orders")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Get()
  list(@Req() request: AppRequest) {
    return this.ordersService.list(request.restaurant!.id);
  }
}
