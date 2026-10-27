import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DashboardService } from "./dashboard.service";

function createService(prisma: Record<string, any>) {
  return new DashboardService(prisma as any, { assertFeature: vi.fn().mockResolvedValue(undefined) } as any);
}

describe("DashboardService settings persistence", () => {
  it("preserves dashboardSettings.splashScreen when updating the theme", async () => {
    const splashScreen = {
      backgroundType: "IMAGE",
      backgroundImageUrl: "/splash.jpg",
      backgroundColor: "#111111",
      logoUrl: "/logo.png",
      logoX: 44,
      logoY: 55
    };
    const prisma = {
      restaurantThemeSettings: {
        findUnique: vi.fn().mockResolvedValue({
          settings: {
            dashboardSettings: { splashScreen, phone: "123" },
            customKey: "keep"
          }
        }),
        upsert: vi.fn().mockResolvedValue({})
      }
    };
    const service = createService(prisma);

    await service.updateTheme("restaurant-1", {
      settings: {
        colors: { primary: "#e51f2a" },
        dashboardSettings: { splashScreen: { backgroundColor: "#ffffff" } }
      },
      customCss: ".menu{}"
    });

    expect(prisma.restaurantThemeSettings.upsert.mock.calls[0][0].update.settings).toEqual({
      dashboardSettings: { splashScreen, phone: "123" },
      customKey: "keep",
      colors: { primary: "#e51f2a" }
    });
  });

  it("preserves splashScreen when general settings are updated without splashScreen", async () => {
    const splashScreen = {
      backgroundType: "COLOR",
      backgroundColor: "#222222",
      backgroundImageUrl: "",
      logoUrl: "/logo.png",
      logoX: 40,
      logoY: 60
    };
    const restaurant = {
      id: "restaurant-1",
      name: "Old name",
      type: "FAST_FOOD",
      description: "",
      city: "",
      country: "",
      whatsappPhone: "",
      logoUrl: "",
      heroImageUrl: "",
      currency: "SYP",
      branches: [{ id: "branch-1", address: "Old address", openingHours: [] }],
      themeSettings: {
        settings: {
          colors: { primary: "#111111" },
          dashboardSettings: {
            phone: "123",
            email: "old@example.com",
            showPrices: true,
            productOpenMode: "MODAL",
            splashScreen
          }
        }
      }
    };
    const prisma = {
      restaurant: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(restaurant),
        update: vi.fn().mockResolvedValue({})
      },
      branch: {
        update: vi.fn().mockResolvedValue({})
      },
      restaurantThemeSettings: {
        upsert: vi.fn().mockResolvedValue({})
      }
    };
    const service = createService(prisma);

    await service.updateSettings("restaurant-1", { name: "New name", phone: "456" });

    expect(prisma.restaurantThemeSettings.upsert.mock.calls[0][0].update.settings.dashboardSettings).toMatchObject({
      phone: "456",
      splashScreen
    });
  });

  it("rejects fractional SYP delivery fee before modifying restaurant data", async () => {
    const prisma = {
      restaurant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "r1", currency: "SYP", branches: [], themeSettings: null }),
        update: vi.fn() },
      restaurantThemeSettings: { upsert: vi.fn() }
    };
    const service = createService(prisma);
    await expect(service.updateSettings("r1", { deliveryFee: "125.50" })).rejects.toMatchObject({
      response: { error: "INVALID_DELIVERY_FEE" }
    });
    expect(prisma.restaurant.update).not.toHaveBeenCalled();
    expect(prisma.restaurantThemeSettings.upsert).not.toHaveBeenCalled();
  });
});

describe("DashboardService linked-product category protection", () => {
  it("blocks category deletion when one of its products is a linked source", async () => {
    const prisma = {
      category: {
        findFirst: vi.fn().mockResolvedValue({
          id: "category-1",
          slug: "pizza",
          products: [{ id: "source-product" }],
          _count: { products: 1 }
        }),
        update: vi.fn()
      },
      productConfigurationDependency: {
        findMany: vi.fn().mockResolvedValue([{
          sourceProductId: "source-product",
          productId: "combo-product",
          owner: { name: "Combo" }
        }])
      },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(prisma))
    };

    await expect(createService(prisma).deleteCategory("restaurant-1", "category-1"))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});
