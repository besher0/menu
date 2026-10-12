import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProductConfiguration, saveProductConfiguration, searchRestaurantProducts } from "./api";
import { ProductConfigurationApiError } from "./types";

afterEach(() => vi.unstubAllGlobals());

describe("product configuration Admin API client", () => {
  it("uses only the approved GET and PUT configuration endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        productId: "p1", mode: "LEGACY", configurationVersion: 0, configurationTree: null, basePrice: "0",
        isAvailable: true, capability: { key: "PRODUCT_CONFIGURATION", assigned: true, canRead: true, canWrite: true }, orderabilityState: "LEGACY"
      } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        productId: "p1", mode: "NETWORK", configurationVersion: 1, configurationTree: { schemaVersion: 1, productId: "p1", revision: 1, basePrice: "0", groups: [] }, basePrice: "0",
        isAvailable: true, capability: { key: "PRODUCT_CONFIGURATION", assigned: true, canRead: true, canWrite: true }, orderabilityState: "PUBLIC_INTEGRATION_PENDING"
      } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await loadProductConfiguration("p1");
    await saveProductConfiguration("p1", 0, { schemaVersion: 1, productId: "p1", revision: 1, basePrice: "0", groups: [] });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/dashboard\/products\/p1\/configuration$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
  });

  it("keeps structured validation and 409 conflict information", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      statusCode: 409,
      error: "PRODUCT_CONFIGURATION_REVISION_CONFLICT",
      message: "conflict",
      details: { expectedVersion: 1, actualVersion: 2 }
    }), { status: 409, headers: { "Content-Type": "application/json" } })));
    await expect(loadProductConfiguration("p1")).rejects.toMatchObject({
      name: "ProductConfigurationApiError",
      status: 409,
      code: "PRODUCT_CONFIGURATION_REVISION_CONFLICT",
      details: { expectedVersion: 1, actualVersion: 2 }
    } satisfies Partial<ProductConfigurationApiError>);
  });

  it.each([
    [400, "PRODUCT_CONFIGURATION_VALIDATION_FAILED", [{ code: "SELF_LINK", path: "$configuration", message: "self" }]],
    [403, "FEATURE_LOCKED", []]
  ])("preserves HTTP %s errors for Arabic UI handling", async (status, code, issues) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ statusCode: status, error: code, message: "failed", issues }), {
      status,
      headers: { "Content-Type": "application/json" }
    })));
    try {
      await loadProductConfiguration("p1");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toMatchObject({ status, code, issues });
    }
  });

  it("uses the existing tenant-scoped product list for linked-product search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { data: [], meta: {} } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await searchRestaurantProducts("pizza");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/dashboard\/products\?/);
    expect(fetchMock.mock.calls[0][0]).toContain("search=pizza");
  });
});
