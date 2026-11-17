import type { PublicMenuData, PublicProduct, PublicProductConfigurationResponse } from "@/lib/api";

export type RestaurantRoute = { view: "home" | "menu" | "product" | "cart"; productSlug?: string };
// Only the existing public route family is eligible for in-memory navigation.
export function restaurantRoute(pathname: string, slug: string, shortRoutes: boolean): RestaurantRoute | null {
  if (!pathname.startsWith("/") || /[\\\u0000-\u001f?#]/.test(pathname)) return null;
  const prefix = `/m/${slug}`;
  let path = pathname;
  if (path === prefix || path.startsWith(`${prefix}/`)) path = path.slice(prefix.length) || "/";
  else if (!shortRoutes || path.startsWith("/m/")) return null;
  path = path.length > 1 ? path.replace(/\/$/, "") : path;
  if (path === "/") return { view: "home" };
  if (path === "/menu" || path === "/cart") return { view: path.slice(1) as "menu" | "cart" };
  const match = /^\/product\/([^/]+)$/.exec(path);
  if (!match) return null;
  try {
    const productSlug = decodeURIComponent(match[1]);
    if (!productSlug || /[/\\\u0000-\u001f]/.test(productSlug) || [".", ".."].includes(productSlug)) return null;
    return { view: "product", productSlug };
  } catch { return null; }
}

export function findSnapshotProduct(data: PublicMenuData, key?: string) {
  if (!key) return undefined;
  const normalize = (value: string) => {
    try { return decodeURIComponent(value).trim().toLowerCase().replace(/\s+/g, "-"); }
    catch { return value.trim().toLowerCase().replace(/\s+/g, "-"); }
  };
  return data.products.find(p => [p.id, p.slug].some(value => value && normalize(value) === normalize(key)));
}

// The current public contract is restaurant-scoped and carries both UI languages.
// It does not implement an outlet differential or a catalog-wide revision.
export function snapshotScope(data: PublicMenuData) {
  return JSON.stringify(["public-menu-v1", data.restaurant.slug, "RESTAURANT", "ar+en", data.restaurant.currency ?? "ل.س"]);
}
export function validSnapshot(value: PublicMenuData, slug: string) {
  return value?.restaurant?.slug === slug && typeof value.restaurant.name === "string"
    && Array.isArray(value.products) && Array.isArray(value.categories) && Boolean(value.theme)
    && value.products.every(p => typeof p.slug === "string");
}

type Cached = { value: PublicProductConfigurationResponse; at: number; bytes: number };
/** Per-provider LRU: never a server/global cache, never a quote/selection cache. */
export class RestaurantConfigurationCache {
  private entries = new Map<string, Cached>();
  private pending = new Map<string, Promise<PublicProductConfigurationResponse>>();
  private generation = 0;
  private inFlight = 0;
  constructor(private readonly tenant: string,
    private readonly fetcher: (slug: string, id: string) => Promise<PublicProductConfigurationResponse>,
    private readonly now = () => Date.now(), private readonly ttl = 30_000,
    private readonly limit = 8, private readonly byteLimit = 2_000_000) {}
  clear() { this.generation++; this.entries.clear(); this.pending.clear(); }
  get size() { return this.entries.size; }
  get pendingCount() { return this.inFlight; }
  async load(slug: string, productId: string, locale: string, currency: string) {
    if (slug !== this.tenant || !productId) throw new Error("Configuration scope mismatch");
    const key = JSON.stringify([slug, "RESTAURANT", locale, currency, productId]);
    const cached = this.entries.get(key);
    if (cached && this.now() - cached.at < this.ttl) {
      this.entries.delete(key); this.entries.set(key, cached);
      return structuredClone(cached.value);
    }
    this.entries.delete(key);
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing);
    const generation = this.generation;
    this.inFlight++;
    const request = (async () => this.fetcher(slug, productId))().then(value => {
      if (value.productId !== productId || value.schemaVersion !== 2 || value.runtimeContext.scope !== "RESTAURANT") {
        throw new Error("Configuration response mismatch");
      }
      const bytes = JSON.stringify(value).length * 2;
      if (generation === this.generation && bytes <= this.byteLimit) {
        this.entries.set(key, { value: structuredClone(value), at: this.now(), bytes });
        const total = () => [...this.entries.values()].reduce((n, entry) => n + entry.bytes, 0);
        while (this.entries.size > this.limit || total() > this.byteLimit) this.entries.delete(this.entries.keys().next().value!);
      }
      return value;
    }).finally(() => { this.inFlight--; if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    return structuredClone(await request);
  }
  prefetch(product: PublicProduct, locale: string, currency: string) {
    if (!product.id || product.productConfiguration?.mode !== "NETWORK" || this.inFlight >= 2) return;
    // A failed speculative request is retried normally on demand, not cached.
    void this.load(this.tenant, product.id, locale, currency).catch(() => undefined);
  }
}
