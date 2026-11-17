import { CanActivate, ExecutionContext, Injectable, Body, Controller, ForbiddenException, Get, Header, HttpCode, Inject, Module, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import type { AppRequest } from "../../common/app-request";
import { CreateFeedbackDto, FeedbackService } from "./feedback.service";

@Injectable()
export class FeedbackIpGuard implements CanActivate {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}
  async canActivate(context: ExecutionContext) {
    const request=context.switchToHttp().getRequest<Request>();
    // Express request.ip follows only the configured trusted proxy boundary; never read XFF here.
    await this.feedback.limitIp(String(request.params.slug),request.ip || request.socket.remoteAddress || "unknown");
    return true;
  }
}
@Controller("public/menus")
export class PublicFeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}
  @UseGuards(FeedbackIpGuard)
  @Post(":slug/feedback") @HttpCode(200) @Header("Cache-Control","no-store")
  submit(@Param("slug") slug: string, @Body() dto: CreateFeedbackDto, @Req() request: Request) {
    return this.feedback.submit(slug,dto,request.ip || request.socket.remoteAddress || "unknown");
  }
}
@Controller("dashboard/feedback")
@UseGuards(JwtAuthGuard,RestaurantContextGuard)
export class DashboardFeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}
  @Get() @Header("Cache-Control","no-store")
  list(@Req() request: AppRequest, @Query("page") page="1") {
    if (request.user?.role!=="SUPER_ADMIN" && request.restaurant?.role!=="OWNER") throw new ForbiddenException();
    return this.feedback.list(request.restaurant!.id,Number(page));
  }
}
@Module({controllers:[PublicFeedbackController,DashboardFeedbackController],providers:[FeedbackService,FeedbackIpGuard]})
export class FeedbackModule {}
