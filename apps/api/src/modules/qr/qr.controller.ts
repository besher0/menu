import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AppRequest } from "../../common/app-request";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { CreateQrCodeDto } from "./dto/create-qr-code.dto";
import { QrService } from "./qr.service";

@Controller("dashboard/qr")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class QrController {
  constructor(@Inject(QrService) private readonly qrService: QrService) {}

  @Get()
  list(@Req() request: AppRequest) {
    return this.qrService.list(request.restaurant!.id, request.restaurant!.slug);
  }

  @Post()
  create(@Req() request: AppRequest, @Body() dto: CreateQrCodeDto) {
    return this.qrService.create(request.restaurant!.id, request.restaurant!.slug, dto);
  }

  @Get(":id/svg")
  svg(@Req() request: AppRequest, @Param("id") id: string) {
    return this.qrService.svgForDashboard(request.restaurant!.id, id);
  }
}
