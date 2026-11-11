import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PublicMenuService } from "./public-menu.service";

function createService(analyticsEvent: { create: ReturnType<typeof vi.fn> }) {
  const prisma = {
    restaurant: {
      findFirst: vi.fn().mockResolvedValue({ id: "restaurant-1", slug: "pizza-lab" })
    },
    analyticsEvent
  };

  return {
    service: new PublicMenuService(prisma as never, { listFeatures: vi.fn() } as never, {} as never),
    prisma
  };
}

describe("PublicMenuService analytics", () => {
  it("rejects menu views without a client id", async () => {
    const { service, prisma } = createService({ create: vi.fn() });

    await expect(service.track("pizza-lab", { type: "MENU_VIEWED" }, "browser", "127.0.0.1"))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it("turns a duplicate menu view into a successful no-op", async () => {
    const create = vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique", {
      code: "P2002",
      clientVersion: "test"
    }));
    const { service } = createService({ create });

    await expect(service.track(
      "pizza-lab",
      { type: "MENU_VIEWED", metadata: { clientId: "12345678-1234-1234-1234-123456789abc" } },
      "browser",
      "127.0.0.1"
    )).resolves.toEqual({ id: null, deduplicated: true });
  });
});

describe("PublicMenuService branch discovery", () => {
  it("loads only active branches and no products for the new QR selector", async () => {
    const { service, prisma } = createService({ create: vi.fn() });
    prisma.restaurant.findFirst.mockResolvedValue({
      slug: "pizza-lab",
      name: "Pizza Lab",
      logoUrl: null,
      branches: [{ id: "branch-1", slug: "hamdaniyeh", name: "الحمدانية" }]
    });

    const result = await service.branchOptions("pizza-lab");

    expect(result.restaurant.branches).toHaveLength(1);
    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: { slug: "pizza-lab", isActive: true, deletedAt: null },
      select: {
        slug: true,
        name: true,
        logoUrl: true,
        branches: {
          where: { isActive: true, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, slug: true, name: true, address: true, city: true }
        }
      }
    });
  });

  it("does not reveal branch names of inactive restaurants", async () => {
    const { service, prisma } = createService({ create: vi.fn() });
    prisma.restaurant.findFirst.mockResolvedValue(null);

    await expect(service.branchOptions("disabled")).rejects.toBeInstanceOf(NotFoundException);
  });
});
