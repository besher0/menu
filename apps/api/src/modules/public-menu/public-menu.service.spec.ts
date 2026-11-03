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
});
