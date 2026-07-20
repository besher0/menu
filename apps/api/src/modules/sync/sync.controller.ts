import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AppRequest } from "../../common/app-request";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { CreateSyncJobDto } from "./dto/create-sync-job.dto";
import { SyncService } from "./sync.service";

@Controller("dashboard/sync")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class SyncController {
  constructor(@Inject(SyncService) private readonly syncService: SyncService) {}

  @Get("jobs")
  list(@Req() request: AppRequest) {
    return this.syncService.list(request.restaurant!.id);
  }

  @Post("jobs")
  create(@Req() request: AppRequest, @Body() dto: CreateSyncJobDto) {
    return this.syncService.create(request.restaurant!.id, dto);
  }

  @Post("jobs/:id/retry")
  retry(@Req() request: AppRequest, @Param("id") id: string) {
    return this.syncService.retry(request.restaurant!.id, id);
  }
}
