import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return {
      ok: true,
      service: "restaurant-menu-builder-api",
      timestamp: new Date().toISOString()
    };
  }
}
