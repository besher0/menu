import type { CartItem } from "./cart-model";
export { indexPublicCatalog as indexMenuProducts } from "@menu/shared";

export function indexMenuQuantities(cart: readonly CartItem[]) {
  const legacy = new Map<string, number>();
  const network = new Map<string, number>();
  for (const line of cart) {
    if (line.mode === "NETWORK") network.set(line.productId, (network.get(line.productId) ?? 0) + line.quantity);
    // Keep the original Legacy find-first behavior, even for historical duplicates.
    else if (!legacy.has(line.slug)) legacy.set(line.slug, line.quantity);
  }
  return { legacy, network };
}
