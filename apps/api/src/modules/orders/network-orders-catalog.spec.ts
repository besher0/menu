import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { NetworkOrdersService } from "./network-orders.service";

function fixture(subscription: unknown[] = [{ planId: "plan-1" }], features: unknown[] = [{ enabled: true }]) {
  const operations: string[] = [];
  const raw = vi.fn()
    .mockImplementationOnce(async () => { operations.push("subscription"); return subscription; })
    .mockImplementationOnce(async () => { operations.push("feature"); return features; })
    .mockImplementationOnce(async () => { operations.push("product-lock"); return [{ id: "p1" }]; });
  const findMany = vi.fn(async () => { operations.push("catalog-read"); return [{ id: "p1" }]; });
  const tx = { $queryRaw: raw, product: { findMany } };
  const service = new NetworkOrdersService({} as never);
  return { operations, raw, findMany, tx, service };
}

describe("network order catalog transaction safety", () => {
  it("checks capability and locks product rows before reading the pricing snapshot", async () => {
    const { operations, raw, findMany, tx, service } = fixture();
    const catalog = await service["lockCatalog"](tx as never, "restaurant-1");
    expect(catalog).toEqual([{ id: "p1" }]);
    expect(operations).toEqual(["subscription", "feature", "product-lock", "catalog-read"]);
    expect(raw).toHaveBeenCalledTimes(3);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId: "restaurant-1" } }));
  });

  it("rejects missing subscriptions without reading products", async () => {
    const { tx, service, raw, findMany } = fixture([]);
    await expect(service["lockCatalog"](tx as never, "restaurant-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects disabled capabilities without reading products", async () => {
    const { tx, service, raw, findMany } = fixture([{ planId: "plan-1" }], [{ enabled: false }]);
    await expect(service["lockCatalog"](tx as never, "restaurant-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(raw).toHaveBeenCalledTimes(2);
    expect(findMany).not.toHaveBeenCalled();
  });
});
