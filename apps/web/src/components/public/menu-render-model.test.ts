import { describe, expect, it } from "vitest";
import type { PublicCategory, PublicProduct } from "@/lib/api";
import type { CartItem } from "./cart-model";
import { indexMenuProducts, indexMenuQuantities } from "./menu-render-model";

describe("menu-only render indexes", () => {
  const categories = [{ slug: "b" }, { slug: "a" }] as PublicCategory[];
  it("groups interleaved choices by the public category sequence, stably and independently of product mode", () => {
    const products = [
      ["combo-a", "combos"], ["pizza-a", "pizza"], ["combo-b", "combos"],
      ["other-a", "other"], ["pizza-b", "pizza"], ["combo-c", "combos"], ["lost", "missing"], ["none", undefined]
    ].map(([id, categorySlug], index) => ({ id, categorySlug, mode: index % 2 ? "LEGACY" : "NETWORK" }));
    for (const order of [["combos", "pizza", "other"], ["other", "pizza", "combos"]]) {
      const groups = ["all", ...order, "empty"].map(slug => ({ slug }));
      const expected = order.flatMap(slug => products.filter(p => p.categorySlug === slug)).concat(products.slice(-2));
      const { ordered } = indexMenuProducts(products, groups);
      expect(ordered).toEqual(expected);
      expect(new Set(ordered).size).toBe(products.length);
      expect(indexMenuProducts(ordered, groups).ordered).toEqual(ordered);
    }
  });
  it("preserves product references/order, category precedence, and uncategorized products", () => {
    const products = [
      { slug: "1", category: { slug: "a" }, categorySlug: "b" },
      { slug: "2", categorySlug: "b" }, { slug: "3", categorySlug: "a" },
      { slug: "4" }, { slug: "5", categorySlug: "unknown" }, { slug: "6", categorySlug: "all" }
    ] as PublicProduct[];
    const before = JSON.stringify(products);
    const index = indexMenuProducts(products, categories);
    expect(index.byCategory.get("a")).toEqual([products[0], products[2]]);
    expect(index.byCategory.get("a")?.[0]).toBe(products[0]);
    expect(index.uncategorized).toEqual(products.slice(3));
    expect(JSON.stringify(products)).toBe(before);
    expect(categories.map(c => c.slug)).toEqual(["b", "a"]);
  });
  it.each([5, 20, 100, 500])("matches the previous filters for %i products", size => {
    const products = Array.from({ length: size }, (_, i) => ({ slug: String(i), categorySlug: ["a", "b", "missing"][i % 3] })) as PublicProduct[];
    const index = indexMenuProducts(products, categories);
    for (const category of categories) expect(index.byCategory.get(category.slug)).toEqual(products.filter(p => p.categorySlug === category.slug));
    expect(index.uncategorized).toEqual(products.filter(p => !categories.some(c => c.slug === p.categorySlug)));
  });
  it("has no cross-snapshot/tenant state and reflects a new product reference", () => {
    const a = { slug: "same", categorySlug: "a", name: "old" } as PublicProduct;
    const first = indexMenuProducts([a], categories);
    const b = { ...a, name: "updated" };
    const second = indexMenuProducts([b], categories);
    expect(first.byCategory.get("a")?.[0]).toBe(a);
    expect(second.byCategory.get("a")?.[0]).toBe(b);
    expect(indexMenuProducts([], categories).byCategory.size).toBe(0);
  });
  it("retains legacy find-first and sums all Network configurations without merging identities", () => {
    const cart = [
      { mode: "LEGACY", slug: "same", quantity: 2 }, { mode: "LEGACY", slug: "same", quantity: 8 },
      { mode: "NETWORK", productId: "same", quantity: 3, lineId: "one", status: "CURRENT" },
      { mode: "NETWORK", productId: "same", quantity: 4, lineId: "two", status: "INVALID" },
      { mode: "NETWORK", productId: "other", quantity: 1 }
    ] as unknown as CartItem[]; // Only the render-index fields are relevant here.
    const before = JSON.stringify(cart), index = indexMenuQuantities(cart);
    expect(index.legacy.get("same")).toBe(2); expect(index.network.get("same")).toBe(7);
    expect(index.network.get("other")).toBe(1); expect(JSON.stringify(cart)).toBe(before);
    expect(indexMenuQuantities([]).network.size).toBe(0);
  });
});
