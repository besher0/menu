import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedPublicMenu, invalidatePublicMenuCache, publicMenuCacheStats } from "./public-menu.cache";

describe("public menu cache", () => {
  beforeEach(() => {
    invalidatePublicMenuCache();
    publicMenuCacheStats.hits = 0;
    publicMenuCacheStats.misses = 0;
  });

  it("reuses the same restaurant payload", async () => {
    const loader = vi.fn(async () => ({ price: 10 }));
    expect(await cachedPublicMenu("one", loader)).toEqual({ price: 10 });
    expect(await cachedPublicMenu("one", loader)).toEqual({ price: 10 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(publicMenuCacheStats.hits).toBe(1);
  });

  it("isolates restaurant keys", async () => {
    const loader = vi.fn(async () => ({ ok: true }));
    await cachedPublicMenu("one", loader);
    await cachedPublicMenu("two", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("coalesces simultaneous misses", async () => {
    const loader = vi.fn(async () => ({ ok: true }));
    await Promise.all(Array.from({ length: 10 }, () => cachedPublicMenu("one", loader)));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads after invalidation", async () => {
    let price = 10;
    await cachedPublicMenu("one", async () => ({ price }));
    price = 20;
    invalidatePublicMenuCache();
    expect(await cachedPublicMenu("one", async () => ({ price }))).toEqual({ price: 20 });
  });

  it("does not restore a stale in-flight result after invalidation", async () => {
    let resolve!: (value: string) => void;
    const old = cachedPublicMenu("one", () => new Promise<string>(r => { resolve = r; }));
    invalidatePublicMenuCache();
    resolve("old");
    await old;
    expect(await cachedPublicMenu("one", async () => "new")).toBe("new");
  });
});
