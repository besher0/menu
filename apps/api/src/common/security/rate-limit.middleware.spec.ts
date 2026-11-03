import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { rateLimitMiddleware } from "./rate-limit.middleware";

function invoke(path: string, ip: string, method = "POST") {
  const headers: Record<string, string> = {};
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const next = vi.fn();
  const request = { path, method, ip } as Request;
  const response = { setHeader: (key: string, value: string) => { headers[key] = value; }, status } as unknown as Response;
  rateLimitMiddleware(request, response, next as NextFunction);
  return { headers, status, json, next };
}

describe("public request rate limiting", () => {
  it("limits analytics to 60 requests per minute per IP", () => {
    const ip = "test-analytics-198.51.100.10";
    for (let i = 0; i < 60; i += 1) {
      expect(invoke("/public/menus/pizza-lab/track", ip).next).toHaveBeenCalledOnce();
    }
    const blocked = invoke("/public/menus/pizza-lab/track", ip);
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(blocked.headers["Retry-After"]).toBeDefined();
  });

  it("applies the tighter checkout policy across prepare and confirm", () => {
    const ip = "test-checkout-198.51.100.11";
    for (let i = 0; i < 10; i += 1) {
      expect(invoke("/public/menus/pizza-lab/checkout/whatsapp/prepare", ip).next).toHaveBeenCalledOnce();
      expect(invoke("/public/menus/pizza-lab/checkout/whatsapp/confirm", ip).next).toHaveBeenCalledOnce();
    }
    expect(invoke("/public/menus/pizza-lab/checkout/whatsapp/confirm", ip).status)
      .toHaveBeenCalledWith(429);
  });

  it("shares checkout limits with legacy WhatsApp orders but not analytics", () => {
    const ip = "test-legacy-198.51.100.12";
    for (let i = 0; i < 20; i += 1) {
      expect(invoke("/public/menus/pizza-lab/orders/whatsapp", ip).next).toHaveBeenCalledOnce();
    }
    expect(invoke("/public/menus/pizza-lab/checkout/whatsapp/prepare", ip).status)
      .toHaveBeenCalledWith(429);
    expect(invoke("/public/menus/pizza-lab/track", ip).next).toHaveBeenCalledOnce();
  });

  it("does not mix rate limit buckets between client IPs", () => {
    const first = invoke("/public/menus/pizza-lab/checkout/whatsapp/prepare", "test-isolation-198.51.100.13");
    const second = invoke("/public/menus/pizza-lab/checkout/whatsapp/prepare", "test-isolation-198.51.100.14");
    expect(first.headers["X-RateLimit-Remaining"]).toBe("19");
    expect(second.headers["X-RateLimit-Remaining"]).toBe("19");
  });
});
