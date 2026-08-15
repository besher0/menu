import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { QrService } from "./qr.service";

@Controller("q")
export class QrPublicController {
  constructor(@Inject(QrService) private readonly qrService: QrService) {}

  @Get(":id")
  async open(@Param("id") id: string, @Req() request: Request, @Res() response: Response) {
    const url = await this.qrService.trackAndResolve(
      id,
      Array.isArray(request.headers["user-agent"]) ? request.headers["user-agent"][0] : request.headers["user-agent"]
    );

    return response.redirect(302, url);
  }
}
