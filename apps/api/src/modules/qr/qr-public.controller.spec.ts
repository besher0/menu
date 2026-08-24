import { describe, expect, it, vi } from "vitest";
import { QrPublicController } from "./qr-public.controller";

describe("QrPublicController", () => {
  it("redirects with Express response instead of returning a wrapped redirect payload", async () => {
    const qrService = {
      trackAndResolve: vi.fn().mockResolvedValue("https://abo-malek.ordersawa.com")
    };
    const controller = new QrPublicController(qrService as any);
    const request = {
      headers: {
        "user-agent": "vitest-agent"
      }
    };
    const response = {
      setHeader: vi.fn(),
      redirect: vi.fn().mockReturnValue("redirect-result")
    };

    const result = await controller.open("qr-1", request as any, response as any);

    expect(qrService.trackAndResolve).toHaveBeenCalledWith("qr-1", "vitest-agent");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
    expect(response.setHeader).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(response.setHeader).toHaveBeenCalledWith("Expires", "0");
    expect(response.setHeader.mock.invocationCallOrder[2]).toBeLessThan(
      response.redirect.mock.invocationCallOrder[0]
    );
    expect(response.redirect).toHaveBeenCalledWith(302, "https://abo-malek.ordersawa.com");
    expect(result).toBe("redirect-result");
  });

  it("uses the first user-agent value when the header is an array", async () => {
    const qrService = {
      trackAndResolve: vi.fn().mockResolvedValue("https://fluffy.ordersawa.com")
    };
    const controller = new QrPublicController(qrService as any);
    const response = {
      setHeader: vi.fn(),
      redirect: vi.fn().mockReturnValue(undefined)
    };

    await controller.open(
      "qr-2",
      { headers: { "user-agent": ["first-agent", "second-agent"] } } as any,
      response as any
    );

    expect(qrService.trackAndResolve).toHaveBeenCalledWith("qr-2", "first-agent");
    expect(response.redirect).toHaveBeenCalledWith(302, "https://fluffy.ordersawa.com");
  });

  it("uses the current resolved target on every request and sends no-cache redirect headers", async () => {
    const qrService = {
      trackAndResolve: vi
        .fn()
        .mockResolvedValueOnce("https://restaurant-1.example/menu")
        .mockResolvedValueOnce("https://restaurant-2.example/menu")
    };
    const controller = new QrPublicController(qrService as any);
    const response = {
      setHeader: vi.fn(),
      redirect: vi.fn().mockReturnValue(undefined)
    };
    const request = {
      headers: {
        "user-agent": "vitest-agent"
      }
    };

    await controller.open("qr-1", request as any, response as any);
    await controller.open("qr-1", request as any, response as any);

    expect(qrService.trackAndResolve).toHaveBeenCalledTimes(2);
    expect(qrService.trackAndResolve).toHaveBeenNthCalledWith(1, "qr-1", "vitest-agent");
    expect(qrService.trackAndResolve).toHaveBeenNthCalledWith(2, "qr-1", "vitest-agent");
    expect(response.redirect).toHaveBeenNthCalledWith(1, 302, "https://restaurant-1.example/menu");
    expect(response.redirect).toHaveBeenNthCalledWith(2, 302, "https://restaurant-2.example/menu");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
    expect(response.setHeader).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(response.setHeader).toHaveBeenCalledWith("Expires", "0");
  });
});
