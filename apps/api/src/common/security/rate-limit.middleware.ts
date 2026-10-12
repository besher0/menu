import { NextFunction, Request, Response } from "express";
import { readPositiveInt } from "./env";

type RateLimitPolicy = {
  name: string;
  windowMs: number;
  max: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();
let lastCleanupAt = Date.now();

const globalPolicy: RateLimitPolicy = {
  name: "global",
  windowMs: readPositiveInt("RATE_LIMIT_GLOBAL_WINDOW_MS", 60_000),
  max: readPositiveInt("RATE_LIMIT_GLOBAL_MAX", 300)
};

const writePolicy: RateLimitPolicy = {
  name: "write",
  windowMs: readPositiveInt("RATE_LIMIT_WRITE_WINDOW_MS", 60_000),
  max: readPositiveInt("RATE_LIMIT_WRITE_MAX", 120)
};

const authPolicy: RateLimitPolicy = {
  name: "auth",
  windowMs: readPositiveInt("RATE_LIMIT_AUTH_WINDOW_MS", 5 * 60_000),
  max: readPositiveInt("RATE_LIMIT_AUTH_MAX", 10)
};

const uploadPolicy: RateLimitPolicy = {
  name: "upload",
  windowMs: readPositiveInt("RATE_LIMIT_UPLOAD_WINDOW_MS", 15 * 60_000),
  max: readPositiveInt("RATE_LIMIT_UPLOAD_MAX", 20)
};

function requestIp(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function policyFor(request: Request): RateLimitPolicy {
  const path = request.path.toLowerCase();

  if (path === "/health") {
    return {
      name: "health",
      windowMs: globalPolicy.windowMs,
      max: Math.max(globalPolicy.max, 1_000)
    };
  }

  if (path === "/auth/login") {
    return authPolicy;
  }

  if (path === "/dashboard/media/upload") {
    return uploadPolicy;
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    return writePolicy;
  }

  return globalPolicy;
}

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < 60_000) {
    return;
  }

  lastCleanupAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function rateLimitMiddleware(request: Request, response: Response, next: NextFunction) {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const policy = policyFor(request);
  const key = `${policy.name}:${requestIp(request)}`;
  const current = buckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + policy.windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  response.setHeader("X-RateLimit-Limit", String(policy.max));
  response.setHeader("X-RateLimit-Remaining", String(Math.max(0, policy.max - bucket.count)));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > policy.max) {
    response.setHeader("Retry-After", String(retryAfterSeconds));
    response.status(429).json({
      message: "Too many requests. Please try again later.",
      statusCode: 429,
      retryAfterSeconds
    });
    return;
  }

  next();
}
