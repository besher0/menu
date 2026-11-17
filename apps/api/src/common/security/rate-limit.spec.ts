import { afterEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("separates quote, analytics and checkout quotas and normalizes trailing slashes", async () => {
  vi.stubEnv("RATE_LIMIT_PUBLIC_QUOTE_MAX", "1");
  vi.stubEnv("RATE_LIMIT_ANALYTICS_MAX", "1");
  vi.stubEnv("RATE_LIMIT_PUBLIC_CHECKOUT_MAX", "2");
  vi.resetModules();
  const { rateLimitMiddleware } = await import("./rate-limit.middleware");
  const status = vi.fn().mockReturnValue({ json: vi.fn() });
  const response = { setHeader: vi.fn(), status } as unknown as Response;
  const next = vi.fn();
  const call = (path: string, method = "POST", ip = "127.0.0.1") =>
    rateLimitMiddleware({ path, method, ip } as Request, response, next);
  call("/public/menus/a/products/p/quote");
  call("/public/menus/a/products/p/quote/");
  call("/public/menus/a/track");
  call("/public/menus/a/track/");
  call("/public/menus/a/checkout/whatsapp/prepare");
  call("/public/menus/a/checkout/whatsapp/confirm/");
  call("/public/menus/a/orders/whatsapp");
  expect(next).toHaveBeenCalledTimes(4);
  expect(status.mock.calls).toEqual([[429], [429], [429]]);
  call("/public/menus/a/products/p/quote", "GET");
  call("/dashboard/products");
  call("/public/menus/a/products/p/quote", "POST", "127.0.0.2");
  expect(next).toHaveBeenCalledTimes(7);
});

it("holds the auth quota across canonical and trailing-slash paths and bounds new buckets", async () => {
  vi.stubEnv("RATE_LIMIT_AUTH_MAX", "1");
  vi.stubEnv("RATE_LIMIT_MAX_BUCKETS", "1");
  vi.resetModules();
  const {rateLimitMiddleware} = await import("./rate-limit.middleware");
  const status = vi.fn().mockReturnValue({json:vi.fn()});
  const response = {setHeader:vi.fn(), status} as unknown as Response;
  const next = vi.fn();
  function request(path: string, ip: string) {
    rateLimitMiddleware({path, ip, method:"POST"} as Request, response, next);
  }
  request("/auth/login", "127.0.0.1");
  request("/auth/login/", "127.0.0.1");
  request("/auth/login", "127.0.0.2");
  expect(next).toHaveBeenCalledTimes(1);
  expect(status.mock.calls).toEqual([[429],[429]]);
});

it("retains a global write safety cap in addition to the shared per-tenant feedback guard", async () => {
  vi.stubEnv("RATE_LIMIT_WRITE_MAX", "1");vi.resetModules();
  const {rateLimitMiddleware} = await import("./rate-limit.middleware");
  const status=vi.fn().mockReturnValue({json:vi.fn()}),response={setHeader:vi.fn(),status} as unknown as Response,next=vi.fn();
  for(const path of ["/public/menus/a/feedback","/public/menus/b/feedback/","/public/menus/a/products/p/quote"])
    rateLimitMiddleware({path,method:"POST",ip:"192.0.2.40"} as Request,response,next);
  expect(next).toHaveBeenCalledTimes(2);expect(status.mock.calls).toEqual([[429]]);
});

it("returns a real HTTP 429 for excessive feedback without sharing quote quota", async () => {
  vi.stubEnv("RATE_LIMIT_WRITE_MAX", "2");vi.resetModules();
  const {rateLimitMiddleware}=await import("./rate-limit.middleware"),express=(await import("express")).default;
  const app=express();app.use(rateLimitMiddleware);app.post("/public/menus/:slug/feedback",(_req,res)=>res.json({accepted:true}));
  app.post("/public/menus/:slug/products/:id/quote",(_req,res)=>res.json({ok:true}));
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  try{const address=server.address() as {port:number},origin="http://127.0.0.1:"+address.port;
    expect((await fetch(origin+"/public/menus/a/feedback",{method:"POST"})).status).toBe(200);
    expect((await fetch(origin+"/public/menus/a/feedback",{method:"POST"})).status).toBe(200);
    const rejected=await fetch(origin+"/public/menus/b/feedback/",{method:"POST"});expect(rejected.status).toBe(429);expect(rejected.headers.get("retry-after")).toBeTruthy();
    expect((await fetch(origin+"/public/menus/a/products/p/quote",{method:"POST"})).status).toBe(200);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
