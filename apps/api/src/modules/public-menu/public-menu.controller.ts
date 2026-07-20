import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { Request } from "express";
import { CreateWhatsappOrderDto } from "./dto/create-whatsapp-order.dto";
import { PublicMenuService } from "./public-menu.service";

@Controller("public/menus")
export class PublicMenuController {
  constructor(@Inject(PublicMenuService) private readonly publicMenuService: PublicMenuService) {}

  @Get("by-host/current")
  menuByHost(@Req() request: Request, @Query("track") track?: string) {
    return this.publicMenuService.menuByHost(request.headers.host, request.headers["user-agent"], track !== "0");
  }

  @Get(":restaurantSlug")
  menu(@Param("restaurantSlug") restaurantSlug: string, @Req() request: Request, @Query("track") track?: string) {
    return this.publicMenuService.menu(restaurantSlug, request.headers["user-agent"], track !== "0");
  }

  @Get(":restaurantSlug/products")
  products(@Param("restaurantSlug") restaurantSlug: string) {
    return this.publicMenuService.products(restaurantSlug);
  }

  @Get(":restaurantSlug/theme")
  theme(@Param("restaurantSlug") restaurantSlug: string) {
    return this.publicMenuService.theme(restaurantSlug);
  }

  @Post(":restaurantSlug/track")
  track(
    @Param("restaurantSlug") restaurantSlug: string,
    @Body() body: { type?: string; path?: string; metadata?: Record<string, unknown> },
    @Req() request: Request
  ) {
    return this.publicMenuService.track(restaurantSlug, body, request.headers["user-agent"]);
  }

  @Post(":restaurantSlug/orders/whatsapp")
  createWhatsappOrder(
    @Param("restaurantSlug") restaurantSlug: string,
    @Body() dto: CreateWhatsappOrderDto
  ) {
    return this.publicMenuService.createWhatsappOrder(restaurantSlug, dto);
  }
}
