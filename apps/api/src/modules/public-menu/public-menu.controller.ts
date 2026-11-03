import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { Request } from "express";
import { CreateWhatsappOrderDto } from "./dto/create-whatsapp-order.dto";
import { PublicMenuService } from "./public-menu.service";
import { PublicWhatsappCheckoutService } from "./public-whatsapp-checkout.service";

@Controller("public/menus")
export class PublicMenuController {
  constructor(
    @Inject(PublicMenuService) private readonly publicMenuService: PublicMenuService,
    @Inject(PublicWhatsappCheckoutService) private readonly publicWhatsappCheckout: PublicWhatsappCheckoutService
  ) {}

  @Get("by-host/current")
  @Header("Cache-Control", "private, no-store, no-cache, must-revalidate")
  menuByHost(@Req() request: Request, @Query("track") track?: string) {
    return this.publicMenuService.menuByHost(request.headers.host, request.headers["user-agent"], track === "1");
  }

  @Get(":restaurantSlug")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  menu(@Param("restaurantSlug") restaurantSlug: string, @Req() request: Request, @Query("track") track?: string) {
    return this.publicMenuService.menu(restaurantSlug, request.headers["user-agent"], track === "1");
  }

  @Get(":restaurantSlug/products")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  products(@Param("restaurantSlug") restaurantSlug: string) {
    return this.publicMenuService.products(restaurantSlug);
  }

  @Get(":restaurantSlug/products/:productId/configuration")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  productConfiguration(
    @Param("restaurantSlug") restaurantSlug: string,
    @Param("productId") productId: string
  ) {
    return this.publicMenuService.productConfiguration(restaurantSlug, productId);
  }

  @Post(":restaurantSlug/products/:productId/quote")
  @HttpCode(200)
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  productQuote(
    @Param("restaurantSlug") restaurantSlug: string,
    @Param("productId") productId: string,
    @Body() body: unknown
  ) {
    return this.publicMenuService.productQuote(restaurantSlug, productId, body);
  }

  @Get(":restaurantSlug/theme")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  theme(@Param("restaurantSlug") restaurantSlug: string) {
    return this.publicMenuService.theme(restaurantSlug);
  }

  @Get(":restaurantSlug/orders/next-number")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  nextWhatsappOrderNumber(@Param("restaurantSlug") restaurantSlug: string) {
    return this.publicMenuService.nextWhatsappOrderNumber(restaurantSlug);
  }

  @Post(":restaurantSlug/track")
  @Header("Cache-Control", "no-store")
  track(
    @Param("restaurantSlug") restaurantSlug: string,
    @Body() body: { type?: string; path?: string; metadata?: Record<string, unknown> },
    @Req() request: Request
  ) {
    return this.publicMenuService.track(restaurantSlug, body, request.headers["user-agent"], request.ip);
  }

  @Post(":restaurantSlug/orders/whatsapp")
  @Header("Cache-Control", "no-store")
  createWhatsappOrder(
    @Param("restaurantSlug") restaurantSlug: string,
    @Body() dto: CreateWhatsappOrderDto
  ) {
    return this.publicMenuService.createWhatsappOrder(restaurantSlug, dto);
  }

  @Post(":restaurantSlug/checkout/whatsapp/prepare")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  prepareWhatsappCheckout(@Param("restaurantSlug") slug: string, @Body() body: unknown) {
    return this.publicWhatsappCheckout.prepare(slug, body);
  }

  @Post(":restaurantSlug/checkout/whatsapp/confirm")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  confirmWhatsappCheckout(@Param("restaurantSlug") slug: string, @Body() body: unknown) {
    return this.publicWhatsappCheckout.confirm(slug, body);
  }
}
