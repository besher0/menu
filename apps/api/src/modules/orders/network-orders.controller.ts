import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Header, HttpCode, Inject, Injectable, Param, Post, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { NetworkOrdersService } from "./network-orders.service";

@Injectable()
export class NetworkOrderLoopbackGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const address = request.socket.remoteAddress;
    if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
      throw new ForbiddenException({ error: "NETWORK_ORDER_TEST_LOOPBACK_REQUIRED" });
    }
    return true;
  }
}

/** Test-only endpoints. The service checks the actual disposable DB target before any write. */
@Controller("public/menus/:restaurantSlug/orders/network-test")
@UseGuards(NetworkOrderLoopbackGuard)
export class NetworkOrdersController {
  constructor(@Inject(NetworkOrdersService) private readonly orders: NetworkOrdersService) {}

  @Post("prepare")
  @HttpCode(200)
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  prepare(@Param("restaurantSlug") restaurantSlug: string, @Body() body: unknown) {
    return this.orders.prepare(restaurantSlug, body);
  }

  @Post()
  @HttpCode(201)
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  create(@Param("restaurantSlug") restaurantSlug: string, @Body() body: unknown) {
    return this.orders.create(restaurantSlug, body);
  }

  @Get(":orderId/preview")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  preview(@Param("restaurantSlug") restaurantSlug: string, @Param("orderId") orderId: string) {
    return this.orders.preview(restaurantSlug, orderId);
  }
}
