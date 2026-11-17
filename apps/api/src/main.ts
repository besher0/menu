import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, mkdirSync } from "fs";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { ApiResponseInterceptor } from "./common/api-response.interceptor";
import { getUploadsDirectory } from "./common/uploads-directory";
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

function originList(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeDomain(value?: string | null) {
  return value
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    ?.split(":")[0]
    ?.replace(/\.$/, "")
    .toLowerCase() || null;
}

function isAllowedRestaurantOrigin(origin: string | null, rootDomain?: string | null) {
  const domain = normalizeDomain(rootDomain);
  if (!origin || !domain || domain === "localhost" || domain.endsWith(".localhost")) {
    return false;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith(`.${domain}`)) {
      return false;
    }

    const subdomain = hostname.slice(0, -(domain.length + 1));
    return url.protocol === "https:" && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)
      && !["www", "api", "admin", "dashboard", "app"].includes(subdomain);
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.getHttpAdapter().getInstance().set("query parser", "extended");
  const config = app.get(ConfigService);
  const bodyLimit = `${readPositiveInt("REQUEST_BODY_LIMIT_KB", 256)}kb`;
  const allowedOrigins = uniqueOrigins([
    ...readStringList("CORS_ORIGINS"),
    ...originList(config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000"),
    ...originList(config.get<string>("API_ORIGIN") ?? "http://localhost:5000"),
    ...originList(process.env.NEXT_PUBLIC_API_URL)
  ]);
  if (process.env.NODE_ENV === "production" && allowedOrigins.includes("*")) {
    throw new Error("Credentialed production CORS requires explicit origins");
  }
  const rootDomain = config.get<string>("ROOT_DOMAIN") ?? config.get<string>("NEXT_PUBLIC_ROOT_DOMAIN") ?? "ordersawa.com";
  const trustProxy = config.get<string>("TRUST_PROXY");

  if (trustProxy) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustProxy === "true" ? 1 : trustProxy);
  }

  app.enableShutdownHooks();
  app.enableCors({
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      const normalizedOrigin = normalizeOrigin(origin);

      if (
        !normalizedOrigin
        || allowedOrigins.includes("*")
        || allowedOrigins.includes(normalizedOrigin)
        || isAllowedRestaurantOrigin(normalizedOrigin, rootDomain)
      ) {
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
  if (process.env.ORDERSAWA_RELEASE_ID) {
    app.use((_request: Request, response: Response, next: NextFunction) => {
      response.setHeader("X-OrderSawa-Release", process.env.ORDERSAWA_RELEASE_ID!);
      next();
    });
  }
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
  const uploadsDir = getUploadsDirectory();
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  app.use(
    "/uploads",
    (request: Request, response: Response, next: NextFunction) => {
      // All public local files are flat raster assets or SVGs admitted by the geometric validator.
      if (!/^\/(?:[a-z0-9_-]+\.(?:png|webp|gif|jpe?g)|verified-svg-[a-z0-9-]+\.svg)$/i.test(request.path)) {
        response.sendStatus(404);
        return;
      }
      next();
    },
    express.static(uploadsDir, {
      maxAge: "1d",
      immutable: true,
      setHeaders(response, filePath) {
        const extension = filePath.split(".").pop()?.toLowerCase();

        response.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
        response.setHeader("X-Content-Type-Options", "nosniff");

        if (extension === "svg") {
          response.setHeader("Content-Type", "image/svg+xml");
          response.setHeader("Content-Disposition", "attachment");
        }
      }
    })
  );

  const port = Number(config.get<string>("PORT") ?? 5000);
  const host = config.get<string>("API_HOST") ?? "127.0.0.1";
  await app.listen(port, host);
}

void bootstrap().catch(() => {
  console.error("API startup failed. Check application configuration and database availability.");
  process.exit(1);
});
