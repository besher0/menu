import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicProductQuote, PublicProductQuoteError } from "@/lib/api";
import type { ProductSelectionV1 } from "@menu/shared";

const selection: ProductSelectionV1 = {
  schemaVersion: 1, productId: "pizza", configurationRevision: 3,
  groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "large" }]
};

afterEach(() => vi.unstubAllGlobals());

describe("public server quote client", () => {
  it("sends selection only and reads the canonical server response", async () => {
    const serverQuote = { productId: "pizza", trustedTotal: "15.000001", canonicalSelection: selection };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: serverQuote }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getPublicProductQuote("restaurant a", "pizza", selection)).toBe(serverQuote);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/public/menus/restaurant%20a/products/pizza/quote");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ selection });
  });

  it("preserves structured revision and capability failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({
        error: "CONFIGURATION_REVISION_CHANGED", message: "Changed", currentRevision: 4,
        issues: [{ code: "STALE_CONFIGURATION_REVISION", path: "$selection", message: "Changed" }]
      }) })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "CAPABILITY_DENIED", message: "Disabled" }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(getPublicProductQuote("r", "pizza", selection)).rejects.toMatchObject({
      status: 409, code: "CONFIGURATION_REVISION_CHANGED", currentRevision: 4,
      issues: [expect.objectContaining({ code: "STALE_CONFIGURATION_REVISION" })]
    });
    await expect(getPublicProductQuote("r", "pizza", selection)).rejects.toMatchObject({
      status: 403, code: "CAPABILITY_DENIED"
    });
  });

  it("fails closed on network failures or missing quote data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(getPublicProductQuote("r", "pizza", selection)).rejects.toBeInstanceOf(PublicProductQuoteError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: null }) }));
    await expect(getPublicProductQuote("r", "pizza", selection)).rejects.toMatchObject({ code: "QUOTE_RESPONSE_INVALID" });
  });
});
