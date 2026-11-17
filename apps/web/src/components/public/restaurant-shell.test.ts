import { describe, expect, it, vi } from "vitest";
import { ABO_MALEK_THEME } from "@menu/shared";
import type { PublicMenuData, PublicProductConfigurationResponse } from "@/lib/api";
import { findSnapshotProduct, restaurantRoute, RestaurantConfigurationCache, snapshotScope, validSnapshot } from "./restaurant-shell-model";
import { publicMenuMetadata } from "@/lib/public-menu-metadata";

const data = { restaurant: { slug: "a", name: "مطعم", currency: "EUR", heroImageUrl: "/hero.png" },
  categories: [], products: [{ id: "p", slug: "بيتزا-كبيرة", name: "بيتزا", currency: "EUR", basePrice: 10, description: "وصف", imageUrl: "/pizza.png" }], theme: ABO_MALEK_THEME } as PublicMenuData;
const envelope = (id = "p", revision = 1) => ({ schemaVersion: 2, productId: id, configurationRevision: revision,
  configuration: { groups: [] }, linkedProducts: [], runtimeContext: { scope: "RESTAURANT" } }) as unknown as PublicProductConfigurationResponse;

describe("restaurant shell scope and routes", () => {
  it.each(["/m/b/menu", "/m/ab/menu", "/dashboard", "/menu", "/m/a/product/x/y", "/m/a/product/%2f", "/m/a/product/%", "//evil.test", "/m/a/product/..", "/m/a/product/a\\b"])("rejects foreign/invalid path %s", path => {
    expect(restaurantRoute(path, "a", false)).toBeNull();
  });
  it("keeps path-based and rewritten subdomain URLs equivalent without crossing tenants", () => {
    expect(restaurantRoute("/m/a/menu", "a", false)).toEqual({ view: "menu" });
    expect(restaurantRoute("/menu", "a", true)).toEqual({ view: "menu" });
    expect(restaurantRoute("/", "a", true)).toEqual({ view: "home" });
    expect(restaurantRoute("/m/b/menu", "a", true)).toBeNull();
    expect(restaurantRoute("/m/a/product/" + encodeURIComponent("بيتزا-كبيرة"), "a", false)?.productSlug).toBe("بيتزا-كبيرة");
  });
  it("does not pick the first product for an unknown URL", () => {
    expect(findSnapshotProduct(data, "missing")).toBeUndefined();
    expect(findSnapshotProduct(data, encodeURIComponent("بيتزا كبيرة"))?.id).toBe("p");
    expect(findSnapshotProduct(data, "p")?.name).toBe("بيتزا");
  });
  it("partitions currency/tenant and explicitly declares the current multilingual restaurant contract", () => {
    expect(snapshotScope(data)).not.toBe(snapshotScope({ ...data, restaurant: { ...data.restaurant, slug: "b" } }));
    expect(snapshotScope(data)).not.toBe(snapshotScope({ ...data, restaurant: { ...data.restaurant, currency: "USD" } }));
    expect(snapshotScope(data)).toContain("RESTAURANT"); expect(snapshotScope(data)).toContain("ar+en");
    expect(validSnapshot(data, "a")).toBe(true); expect(validSnapshot(data, "b")).toBe(false);
    expect(validSnapshot({ ...data, products: null } as unknown as PublicMenuData, "a")).toBe(false);
  });
  it("uses the same original SEO fields for local and direct routes", () => {
    const product = publicMenuMetadata(data, { view: "product", productSlug: "p" });
    expect(product.title).toBe("بيتزا | مطعم"); expect(product.description).toBe("وصف");
    expect(product.openGraph?.images).toEqual(["/pizza.png"]);
    expect(String(product.alternates?.canonical)).toMatch(/\/product\/p$/);
    expect(publicMenuMetadata(data, { view: "home" }).title).toBe("مطعم | المنيو");
    expect(publicMenuMetadata(data, { view: "menu" }).title).toBe("مطعم | قائمة الطعام");
    expect(publicMenuMetadata(data, { view: "cart" }).title).toBe("مطعم | السلة");
  });
});

describe("bounded configuration cache (not financial authority)", () => {
  it("deduplicates concurrent reads and isolates returned mutable selections from the cached graph", async () => {
    const fetcher = vi.fn(async () => envelope()); const cache = new RestaurantConfigurationCache("a", fetcher);
    const [one, two] = await Promise.all([cache.load("a", "p", "ar", "EUR"), cache.load("a", "p", "ar", "EUR")]);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(one).not.toBe(two);
    one.configurationRevision = 99;
    expect((await cache.load("a", "p", "ar", "EUR")).configurationRevision).toBe(1);
  });
  it("expires independently of the owner's configuration revision", async () => {
    let now = 0; const fetcher = vi.fn(async () => envelope());
    const cache = new RestaurantConfigurationCache("a", fetcher, () => now);
    await cache.load("a", "p", "ar", "EUR"); now = 30_001;
    await cache.load("a", "p", "ar", "EUR"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("never shares across tenant, locale or currency", async () => {
    const fetcher = vi.fn(async () => envelope()); const cache = new RestaurantConfigurationCache("a", fetcher);
    await expect(cache.load("b", "p", "ar", "EUR")).rejects.toThrow("scope");
    await cache.load("a", "p", "ar", "EUR"); await cache.load("a", "p", "en", "EUR"); await cache.load("a", "p", "ar", "USD");
    expect(fetcher).toHaveBeenCalledTimes(3);
    const other = new RestaurantConfigurationCache("a", fetcher); await other.load("a", "p", "ar", "EUR");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("evicts least-recently-used entries and respects the byte budget", async () => {
    const fetcher = vi.fn(async (_slug: string, id: string) => envelope(id));
    const cache = new RestaurantConfigurationCache("a", fetcher, () => 0, 30_000, 2);
    for (const id of ["p", "q", "p", "r", "q"]) await cache.load("a", id, "ar", "EUR");
    expect(cache.size).toBe(2); expect(fetcher).toHaveBeenCalledTimes(4);
    const tiny = new RestaurantConfigurationCache("a", fetcher, () => 0, 30_000, 8, 2);
    await tiny.load("a", "p", "ar", "EUR"); expect(tiny.size).toBe(0);
  });
  it("does not cache failures, foreign products or obsolete in-flight reads", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(envelope("wrong")).mockResolvedValue(envelope());
    const cache = new RestaurantConfigurationCache("a", fetcher);
    await expect(cache.load("a", "p", "ar", "EUR")).rejects.toThrow("offline");
    await expect(cache.load("a", "p", "ar", "EUR")).rejects.toThrow("mismatch");
    await cache.load("a", "p", "ar", "EUR"); expect(fetcher).toHaveBeenCalledTimes(3);
    let resolve!: (value: PublicProductConfigurationResponse) => void;
    const delayed = new RestaurantConfigurationCache("a", () => new Promise(r => { resolve = r; }));
    const pending = delayed.load("a", "p", "ar", "EUR"); delayed.clear(); resolve(envelope()); await pending;
    expect(delayed.size).toBe(0);
  });
  it("caps speculative concurrency at two without prefetching legacy or the whole catalog", () => {
    const fetcher = vi.fn(() => new Promise<PublicProductConfigurationResponse>(() => undefined));
    const cache = new RestaurantConfigurationCache("a", fetcher);
    cache.prefetch(data.products[0], "ar", "EUR"); expect(fetcher).not.toHaveBeenCalled();
    for (let i = 0; i < 500; i++) cache.prefetch({ ...data.products[0], id: String(i), productConfiguration: { mode: "NETWORK" } as any }, "ar", "EUR");
    expect(fetcher).toHaveBeenCalledTimes(2); expect(cache.pendingCount).toBe(2);
    cache.clear();
    cache.prefetch({ ...data.products[0], id: "after-invalidation", productConfiguration: { mode: "NETWORK" } as any }, "ar", "EUR");
    expect(fetcher).toHaveBeenCalledTimes(2); // Clearing entries does not erase actual in-flight work.
  });
});
