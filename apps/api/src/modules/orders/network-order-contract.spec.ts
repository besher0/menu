import { describe, expect, it } from "vitest";
import { issueAcceptanceToken, parseNetworkOrderRequest, sha256, verifyAcceptanceToken } from "./network-order-contract";
import { NetworkOrdersService } from "./network-orders.service";
import { NetworkOrderLoopbackGuard } from "./network-orders.controller";

const selection = { schemaVersion: 1, productId: "pizza", configurationRevision: 1,
  groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" }] };
const draft = { locale: "ar", items: [{ productId: "pizza", quantity: 2, selection }] };

describe("Stage 6C test-only order contract", () => {
  it("accepts selections and quantities, but rejects client prices at every depth", () => {
    expect(parseNetworkOrderRequest(draft, false)).toMatchObject(draft);
    expect(() => parseNetworkOrderRequest({ ...draft, totalAmount: "1" }, false)).toThrow();
    expect(() => parseNetworkOrderRequest({ ...draft, items: [{ ...draft.items[0], unitPrice: "1" }] }, false)).toThrow();
    expect(() => parseNetworkOrderRequest({ ...draft, items: [{ ...draft.items[0], selection: { ...selection, trustedTotal: "1" } }] }, false)).toThrow();
    expect(() => parseNetworkOrderRequest({ ...draft, items: [{ ...draft.items[0], quantity: 101 }] }, false)).toThrow();
  });

  it("binds acceptance to the restaurant, exact draft, and expiry", () => {
    const digest = sha256(draft);
    const token = issueAcceptanceToken("restaurant-a", digest, 1_000);
    expect(verifyAcceptanceToken(token, "restaurant-a", digest, 2_000)).toBe(true);
    expect(verifyAcceptanceToken(token, "restaurant-b", digest, 2_000)).toBe(false);
    expect(verifyAcceptanceToken(token, "restaurant-a", sha256({ ...draft, total: "2" }), 2_000)).toBe(false);
    expect(verifyAcceptanceToken(token, "restaurant-a", digest, 602_000)).toBe(false);
    expect(verifyAcceptanceToken(`${token}x`, "restaurant-a", digest, 2_000)).toBe(false);
  });

  it("canonicalizes object keys for an idempotent payload digest", () => {
    expect(sha256({ a: 1, b: { x: 2, y: 3 } })).toBe(sha256({ b: { y: 3, x: 2 }, a: 1 }));
  });

  it("rejects production mode, non-disposable databases and non-loopback HTTP clients", async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldFlag = process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
    const service = new NetworkOrdersService({
      $queryRaw: async () => [{ name: "production", address: "127.0.0.1", port: 55440 }]
    } as any);
    try {
      process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = "1";
      process.env.NODE_ENV = "production";
      await expect(service.prepare("r", draft)).rejects.toThrow();
      process.env.NODE_ENV = "test";
      await expect(service.prepare("r", draft)).rejects.toThrow();
      const guard = new NetworkOrderLoopbackGuard();
      expect(() => guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ socket: { remoteAddress: "198.51.100.8" } }) }) } as any)).toThrow();
    } finally {
      if (oldFlag === undefined) delete process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS;
      else process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = oldFlag;
      if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldNodeEnv;
    }
  });
});
