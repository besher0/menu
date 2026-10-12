import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FeatureFlagsService } from "./feature-flags.service";

describe("FeatureFlagsService assigned package capabilities", () => {
  it("separates assigned entitlement from billing-cycle status", async () => {
    const prisma = {
      restaurantSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          status: "CANCELED",
          plan: { features: [{ key: "PRODUCT_CONFIGURATION", enabled: true, limit: null }] }
        })
      }
    };
    const service = new FeatureFlagsService(prisma as any);

    await expect(service.canUseAssignedFeature("restaurant-1", "PRODUCT_CONFIGURATION")).resolves.toBe(true);
    await expect(service.canUseFeature("restaurant-1", "PRODUCT_CONFIGURATION")).resolves.toBe(false);
  });

  it("denies writes when the capability is not assigned", async () => {
    const prisma = {
      restaurantSubscription: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    const service = new FeatureFlagsService(prisma as any);

    await expect(service.assertAssignedFeature("restaurant-1", "PRODUCT_CONFIGURATION"))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
