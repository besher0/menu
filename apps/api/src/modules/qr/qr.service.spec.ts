import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QrService } from "./qr.service";

vi.mock("qrcode", () => ({
  toString: vi.fn(async (value: string) => `<svg>${value}</svg>`)
}));

const createdAt = new Date("2026-08-15T00:00:00.000Z");

function qrCode(overrides: Record<string, any> = {}) {
  return {
    id: "qr-1",
    restaurantId: "restaurant-1",
    branchId: null,
    label: "Main menu",
    targetUrl: "https://abo-malek.ordersawa.com",
    createdAt,
    branch: null,
    ...overrides
  };
}

function createService(prisma: Record<string, any>) {
  const featureFlags = {
    assertFeature: vi.fn().mockResolvedValue(undefined)
  };
  const config = {
    get: vi.fn((key: string) => {
      const values: Record<string, string> = {
        API_ORIGIN: "https://api.ordersawa.com",
        ROOT_DOMAIN: "ordersawa.com"
      };

      return values[key];
    })
  };

  return new QrService(prisma as any, featureFlags as any, config as any);
}

describe("QrService updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates targetUrl without changing id or qrUrl", async () => {
    const prisma = {
      branch: {
        findFirst: vi.fn()
      },
      qrCode: {
        create: vi.fn().mockResolvedValue(qrCode()),
        findFirst: vi.fn().mockResolvedValue(qrCode()),
        update: vi.fn().mockResolvedValue(qrCode({ targetUrl: "https://abo-malek.ordersawa.com/menu" }))
      }
    };
    const service = createService(prisma);

    const created = await service.create("restaurant-1", "abo-malek", {
      label: "Main menu",
      targetUrl: "main-menu"
    });
    const updated = await service.update("restaurant-1", "abo-malek", created.id, {
      targetUrl: "/menu"
    });

    expect(updated.id).toBe(created.id);
    expect(updated.qrUrl).toBe(created.qrUrl);
    expect(updated.targetUrl).toBe("https://abo-malek.ordersawa.com/menu");
    expect(prisma.qrCode.create).toHaveBeenCalledTimes(1);
    expect(prisma.qrCode.update).toHaveBeenCalledWith({
      where: { id: "qr-1" },
      data: { targetUrl: "https://abo-malek.ordersawa.com/menu" },
      include: { branch: true }
    });
  });

  it("redirects to the updated targetUrl while keeping analytics on the same QR", async () => {
    const prisma = {
      analyticsEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      qrCode: {
        findUnique: vi.fn().mockResolvedValue(
          qrCode({
            targetUrl: "https://abo-malek.ordersawa.com/menu",
            restaurant: { isActive: true, deletedAt: null }
          })
        )
      }
    };
    const service = createService(prisma);

    const targetUrl = await service.trackAndResolve("qr-1", "vitest");

    expect(targetUrl).toBe("https://abo-malek.ordersawa.com/menu");
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
      data: {
        restaurantId: "restaurant-1",
        branchId: null,
        type: "QR_OPENED",
        path: "https://abo-malek.ordersawa.com/menu",
        userAgent: "vitest",
        metadata: {
          qrCodeId: "qr-1",
          label: "Main menu"
        }
      }
    });
  });

  it("does not allow a restaurant to update another restaurant's QR", async () => {
    const prisma = {
      qrCode: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn()
      }
    };
    const service = createService(prisma);

    await expect(service.update("restaurant-2", "other", "qr-1", { targetUrl: "/menu" })).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(prisma.qrCode.update).not.toHaveBeenCalled();
  });

  it("updates only label when targetUrl is omitted", async () => {
    const prisma = {
      qrCode: {
        findFirst: vi.fn().mockResolvedValue(qrCode()),
        update: vi.fn().mockResolvedValue(qrCode({ label: "QR جديد" }))
      }
    };
    const service = createService(prisma);

    const updated = await service.update("restaurant-1", "abo-malek", "qr-1", {
      label: "QR جديد"
    });

    expect(updated.label).toBe("QR جديد");
    expect(updated.targetUrl).toBe("https://abo-malek.ordersawa.com");
    expect(prisma.qrCode.update.mock.calls[0][0].data).toEqual({ label: "QR جديد" });
  });

  it("rejects invalid targetUrl values", async () => {
    const prisma = {
      qrCode: {
        findFirst: vi.fn().mockResolvedValue(qrCode()),
        update: vi.fn()
      }
    };
    const service = createService(prisma);

    await expect(service.update("restaurant-1", "abo-malek", "qr-1", { targetUrl: "ftp://example.com" })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.update("restaurant-1", "abo-malek", "qr-1", { targetUrl: "" })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.qrCode.update).not.toHaveBeenCalled();
  });

  it("validates a changed branch belongs to the same restaurant", async () => {
    const prisma = {
      branch: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      qrCode: {
        findFirst: vi.fn().mockResolvedValue(qrCode()),
        update: vi.fn()
      }
    };
    const service = createService(prisma);

    await expect(service.update("restaurant-1", "abo-malek", "qr-1", { branchId: "branch-2" })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: "branch-2", restaurantId: "restaurant-1", deletedAt: null }
    });
    expect(prisma.qrCode.update).not.toHaveBeenCalled();
  });
});
