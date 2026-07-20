import { Controller, Get, Inject, Param, Redirect, Req } from "@nestjs/common";
import { Request } from "express";
import { QrService } from "./qr.service";

@Controller("q")
export class QrPublicController {
  constructor(@Inject(QrService) private readonly qrService: QrService) {}

  @Get(":id")
  @Redirect()
  async open(@Param("id") id: string, @Req() request: Request) {
    const url = await this.qrService.trackAndResolve(
      id,
      Array.isArray(request.headers["user-agent"]) ? request.headers["user-agent"][0] : request.headers["user-agent"]
    );

    return { url, statusCode: 302 };
  }
}
