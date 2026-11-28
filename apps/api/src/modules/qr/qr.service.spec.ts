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

  it("reads QrCode from the database on each scan so updated targetUrl is used", async () => {
    const prisma = {
      analyticsEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      qrCode: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(
            qrCode({
              targetUrl: "https://restaurant-1.example/menu",
              restaurant: { isActive: true, deletedAt: null }
            })
          )
          .mockResolvedValueOnce(
            qrCode({
              targetUrl: "https://restaurant-2.example/menu",
              restaurant: { isActive: true, deletedAt: null }
            })
          )
      }
    };
    const service = createService(prisma);

    await expect(service.trackAndResolve("qr-1", "vitest")).resolves.toBe("https://restaurant-1.example/menu");
    await expect(service.trackAndResolve("qr-1", "vitest")).resolves.toBe("https://restaurant-2.example/menu");

    expect(prisma.qrCode.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.qrCode.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: "qr-1" },
      include: { branch: true, restaurant: true }
    });
    expect(prisma.qrCode.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: "qr-1" },
      include: { branch: true, restaurant: true }
    });
    expect(prisma.analyticsEvent.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: "restaurant-1",
          path: "https://restaurant-1.example/menu"
        })
      })
    );
    expect(prisma.analyticsEvent.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: "restaurant-1",
          path: "https://restaurant-2.example/menu"
        })
      })
    );
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


describe("opt-in multi-branch QR compatibility", () => {
  it("creates the new selector without updating any existing printed QR", async () => {
    const old = qrCode();
    const newCode = qrCode({
      id: "qr-selector",
      label: "اختيار الفرع",
      targetUrl: "https://abo-malek.ordersawa.com/branches"
    });
    const prisma = {
      qrCode: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(newCode),
        update: vi.fn()
      }
    };
    const service = createService(prisma);
    const result = await service.createBranchSelector("restaurant-1", "abo-malek");

    expect(result.id).toBe("qr-selector");
    expect(result.qrUrl).toBe("https://api.ordersawa.com/q/qr-selector");
    expect(result.targetUrl).toBe("https://abo-malek.ordersawa.com/branches");
    expect(prisma.qrCode.create).toHaveBeenCalledWith({
      data: {
        restaurantId: "restaurant-1",
        branchId: null,
        label: "اختيار الفرع",
        targetUrl: "https://abo-malek.ordersawa.com/branches"
      },
      include: { branch: true }
    });
    expect(prisma.qrCode.update).not.toHaveBeenCalled();
    expect(old.targetUrl).toBe("https://abo-malek.ordersawa.com");
  });

  it("reuses an existing new selector and never creates duplicates on repeated requests", async () => {
    const prisma = {
      qrCode: {
        findFirst: vi.fn().mockResolvedValue(qrCode({
          id: "selector-1",
          targetUrl: "https://abo-malek.ordersawa.com/branches"
        })),
        create: vi.fn(),
        update: vi.fn()
      }
    };
    const service = createService(prisma);
    const first = await service.createBranchSelector("restaurant-1", "abo-malek");
    const second = await service.createBranchSelector("restaurant-1", "abo-malek");

    expect(first.qrUrl).toBe(second.qrUrl);
    expect(prisma.qrCode.create).not.toHaveBeenCalled();
    expect(prisma.qrCode.update).not.toHaveBeenCalled();
  });

  it("creates a branch-specific QR using a stable ID, without modifying old branch QR links", async () => {
    const prisma = {
      branch: {
        findFirst: vi.fn().mockResolvedValue({
          id: "branch-1", slug: "first-branch", name: "فرع أول", isActive: true
        })
      },
      qrCode: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: any) => qrCode({ ...data, id: "new-qr" })),
        update: vi.fn()
      }
    };
    const service = createService(prisma);
    const entry = await service.createBranchEntry("restaurant-1", "abo-malek", "branch-1");

    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: "branch-1", restaurantId: "restaurant-1", isActive: true, deletedAt: null }
    });
    expect(entry.targetUrl).toBe("https://abo-malek.ordersawa.com/?selectedBranch=branch-1");
    expect(entry.qrUrl).toBe("https://api.ordersawa.com/q/new-qr");
    expect(prisma.qrCode.update).not.toHaveBeenCalled();
  });

  it("does not create an entry code for a branch outside the restaurant or disabled", async () => {
    const prisma = {
      branch: { findFirst: vi.fn().mockResolvedValue(null) },
      qrCode: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
    };
    const service = createService(prisma);

    await expect(service.createBranchEntry("restaurant-1", "abo-malek", "other-branch"))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.qrCode.create).not.toHaveBeenCalled();
  });

  it("returns actual event counts for each QR instead of a synthetic estimate", async () => {
    const prisma = {
      qrCode: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([
          qrCode({ id: "old-qr" }),
          qrCode({ id: "new-qr", targetUrl: "https://abo-malek.ordersawa.com/branches" })
        ])
      },
      $queryRaw: vi.fn().mockResolvedValue([{ qrCodeId: "old-qr", scans: 7n }])
    };
    const service = createService(prisma);
    const codes = await service.list("restaurant-1", "abo-malek");

    expect(codes).toHaveLength(2);
    expect(codes[0].scanCount).toBe(7);
    expect(codes[1].scanCount).toBe(0);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
