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
      redirect: vi.fn().mockReturnValue("redirect-result")
    };

    const result = await controller.open("qr-1", request as any, response as any);

    expect(qrService.trackAndResolve).toHaveBeenCalledWith("qr-1", "vitest-agent");
    expect(response.redirect).toHaveBeenCalledWith(302, "https://abo-malek.ordersawa.com");
    expect(result).toBe("redirect-result");
  });

  it("uses the first user-agent value when the header is an array", async () => {
    const qrService = {
      trackAndResolve: vi.fn().mockResolvedValue("https://fluffy.ordersawa.com")
    };
    const controller = new QrPublicController(qrService as any);
    const response = {
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
});
