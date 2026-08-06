import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import express from "express";
import { AppModule } from "./app.module";
import { ApiResponseInterceptor } from "./common/api-response.interceptor";
import { readPositiveInt, readStringList } from "./common/security/env";
import { rateLimitMiddleware } from "./common/security/rate-limit.middleware";
import { securityHeadersMiddleware } from "./common/security/security-headers.middleware";

function normalizeOrigin(value?: string | null) {
  if (!value || value === "*") {
    return value ?? null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function uniqueOrigins(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeOrigin(value))
        .filter((value): value is string => Boolean(value))
    )
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const bodyLimit = `${readPositiveInt("REQUEST_BODY_LIMIT_KB", 256)}kb`;
  const allowedOrigins = uniqueOrigins([
    ...readStringList("CORS_ORIGINS"),
    config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000",
    config.get<string>("API_ORIGIN") ?? "http://localhost:5000",
    process.env.NEXT_PUBLIC_API_URL
  ]);
  const trustProxy = config.get<string>("TRUST_PROXY");

  if (trustProxy) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustProxy === "true" ? 1 : trustProxy);
  }

  app.enableCors({
    origin(origin, callback) {
      const normalizedOrigin = normalizeOrigin(origin);

      if (!normalizedOrigin || allowedOrigins.includes("*") || allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Restaurant-Id", "x-restaurant-id"]
  });
  app.use(securityHeadersMiddleware);
  app.use(rateLimitMiddleware);
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
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
      maxAge: "1d",
      immutable: true,
      setHeaders(response, filePath) {
        const extension = filePath.split(".").pop()?.toLowerCase();

        response.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
        response.setHeader("X-Content-Type-Options", "nosniff");

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
