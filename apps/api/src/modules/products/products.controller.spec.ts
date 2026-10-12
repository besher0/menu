import { ForbiddenException } from "@nestjs/common";
import { ProductConfigurationV1 } from "@menu/shared";
import { describe, expect, it, vi } from "vitest";
import { ProductsController } from "./products.controller";

const dto = {
  expectedVersion: 0,
  configuration: {
    schemaVersion: 1,
    productId: "product-1",
    revision: 1,
    basePrice: "0",
    groups: []
  } as ProductConfigurationV1
};

function request(role: "OWNER" | "MANAGER" | "EDITOR" | "EMPLOYEE") {
  return { restaurant: { id: "restaurant-1", role } } as any;
}

describe("ProductsController configuration authorization", () => {
  it("allows a management role and uses trusted restaurant context", async () => {
    const configurationService = { save: vi.fn().mockResolvedValue({}) };
    const controller = new ProductsController({} as any, {} as any, configurationService as any);

    await controller.saveConfiguration(request("EDITOR"), "product-1", dto);
    expect(configurationService.save).toHaveBeenCalledWith("restaurant-1", "product-1", dto);
  });

  it("denies employees from structural configuration changes", () => {
    const configurationService = { save: vi.fn() };
    const controller = new ProductsController({} as any, {} as any, configurationService as any);

    expect(() => controller.saveConfiguration(request("EMPLOYEE"), "product-1", dto))
      .toThrow(ForbiddenException);
    expect(configurationService.save).not.toHaveBeenCalled();
  });
});
