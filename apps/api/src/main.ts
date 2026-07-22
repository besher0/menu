import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import express from "express";
import { AppModule } from "./app.module";
import { ApiResponseInterceptor } from "./common/api-response.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true
    })
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  const uploadsDir = join(process.cwd(), "uploads");
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  app.use(
    "/uploads",
    express.static(uploadsDir, {
      setHeaders(response, filePath) {
        const extension = filePath.split(".").pop()?.toLowerCase();

        if (extension === "glb") {
          response.setHeader("Content-Type", "model/gltf-binary");
        }

        if (extension === "gltf") {
          response.setHeader("Content-Type", "model/gltf+json");
        }

        if (extension === "usdz") {
          response.setHeader("Content-Type", "model/vnd.usdz+zip");
        }

        if (extension === "glb" || extension === "gltf" || extension === "usdz") {
          response.setHeader("Access-Control-Allow-Origin", "*");
        }
      }
    })
  );

  const port = Number(config.get<string>("PORT") ?? 5000);
  const host = config.get<string>("API_HOST") ?? "127.0.0.1";
  await app.listen(port, host);
}

void bootstrap();
