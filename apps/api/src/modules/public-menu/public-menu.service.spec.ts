import { BadRequestException } from "@nestjs/common";
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
  it("writes a dedupe key and 30-minute bucket for menu views", async () => {
    const create = vi.fn().mockResolvedValue({ id: "view-1" });
    const { service } = createService({ create });

    await expect(service.track(
      "pizza-lab",
      { type: "MENU_VIEWED", path: "/m/pizza-lab", metadata: { clientId: "12345678-1234-1234-1234-123456789abc" } },
      "browser",
      "127.0.0.1"
    )).resolves.toEqual({ id: "view-1", deduplicated: false });

    const data = create.mock.calls[0][0].data;
    expect(data.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
    expect(data.dedupeBucket).toBeInstanceOf(Date);
    expect(data.dedupeBucket.getTime() % (30 * 60_000)).toBe(0);
  });

  it("does not deduplicate unrelated event types", async () => {
    const create = vi.fn().mockResolvedValue({ id: "product-view-1" });
    const { service } = createService({ create });

    await expect(service.track(
      "pizza-lab",
      { type: "PRODUCT_VIEWED", metadata: { productId: "p1" } },
      "browser",
      "127.0.0.1"
    )).resolves.toEqual({ id: "product-view-1", deduplicated: false });
    expect(create.mock.calls[0][0].data.dedupeKey).toBeUndefined();
  });

  it("does not swallow unique violations for other event types", async () => {
    const create = vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique", {
      code: "P2002", clientVersion: "test"
    }));
    const { service } = createService({ create });
    await expect(service.track("pizza-lab", { type: "PRODUCT_VIEWED" }, "browser"))
      .rejects.toMatchObject({ code: "P2002" });
  });

});
