import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "./modules/prisma/prisma.service";

@Controller()
export class AppController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Get("health/ready")
  async readiness() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { ready: true };
    } catch {
      throw new ServiceUnavailableException("Database is unavailable");
    }
  }

  @Get("health")
  health() {
    return {
      ok: true,
      service: "restaurant-menu-builder-api",
      timestamp: new Date().toISOString()
    };
  }
}
