import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  record(restaurantId: string, type: string, metadata?: Record<string, unknown>) {
    return this.prisma.analyticsEvent.create({
      data: {
        restaurantId,
        type,
        metadata: metadata as Prisma.InputJsonValue | undefined
      }
    });
  }
}
