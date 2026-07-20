import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AppRequest } from "../../common/app-request";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { AddSectionDto } from "./dto/add-section.dto";
import { ReorderSectionsDto } from "./dto/reorder-sections.dto";
import { UpdateSectionDto } from "./dto/update-section.dto";
import { BuilderService } from "./builder.service";

@Controller("dashboard/builder")
@UseGuards(JwtAuthGuard, RestaurantContextGuard)
export class BuilderController {
  constructor(@Inject(BuilderService) private readonly builderService: BuilderService) {}

  @Get()
  getBuilder(@Req() request: AppRequest) {
    return this.builderService.getBuilder(request.restaurant!.id);
  }

  @Post("sections")
  addSection(@Req() request: AppRequest, @Body() dto: AddSectionDto) {
    return this.builderService.addSection(request.restaurant!.id, dto);
  }

  @Patch("sections/reorder")
  reorderSections(@Req() request: AppRequest, @Body() dto: ReorderSectionsDto) {
    return this.builderService.reorderSections(request.restaurant!.id, dto);
  }

  @Patch("sections/:id")
  updateSection(@Req() request: AppRequest, @Param("id") id: string, @Body() dto: UpdateSectionDto) {
    return this.builderService.updateSection(request.restaurant!.id, id, dto);
  }

  @Delete("sections/:id")
  deleteSection(@Req() request: AppRequest, @Param("id") id: string) {
    return this.builderService.deleteSection(request.restaurant!.id, id);
  }

  @Post("publish")
  publish(@Req() request: AppRequest) {
    return this.builderService.publish(request.restaurant!.id, request.user?.sub);
  }
}
