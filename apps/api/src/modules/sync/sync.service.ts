import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SyncDirection, SyncType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSyncJobDto } from "./dto/create-sync-job.dto";

const syncTypes = ["PRODUCTS", "CATEGORIES", "MENUS", "ORDERS", "THEME", "MEDIA", "SETTINGS", "ANALYTICS"] as const;
const syncDirections = ["PUSH", "PULL"] as const;

@Injectable()
export class SyncService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(restaurantId: string) {
    return this.prisma.syncJob.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  create(restaurantId: string, dto: CreateSyncJobDto) {
    const type = this.parseType(dto.type);
    const direction = this.parseDirection(dto.direction ?? "PUSH");

    return this.prisma.syncJob.create({
      data: {
        restaurantId,
        type,
        direction,
        status: "PENDING",
        payload: (dto.payload ?? {}) as Prisma.InputJsonObject
      }
    });
  }

  async retry(restaurantId: string, id: string) {
    const job = await this.prisma.syncJob.findFirst({
      where: { id, restaurantId }
    });

    if (!job) {
      throw new NotFoundException("Sync job not found");
    }

    return this.prisma.syncJob.update({
      where: { id },
      data: {
        status: "PENDING",
        attempts: { increment: 1 },
        lastError: null,
        processedAt: null
      }
    });
  }

  private parseType(type: string) {
    if (!syncTypes.includes(type as SyncType)) {
      throw new BadRequestException("Invalid sync type");
    }

    return type as SyncType;
  }

  private parseDirection(direction: string) {
    if (!syncDirections.includes(direction as SyncDirection)) {
      throw new BadRequestException("Invalid sync direction");
    }

    return direction as SyncDirection;
  }
}
