import {
  createSelectionKeyV2 as createSelectionKey,
  sumMoney,
  compareMoney,
  parseProductSelectionV2,
  type ConfigurationSnapshotV2,
  DEFAULT_ENGINE_LIMITS,
  validateMoneyString,
  type ConfigurationIssue,
  type PriceLine,
  type ProductSelectionV2
} from "@menu/shared";
import type { PublicProduct, PublicProductQuoteResponse } from "@/lib/api";

export type LegacyCartItem = {
  mode: "LEGACY";
  productId?: string;
  lineId: string;
  slug: string;
  name: string;
  quantity: number;
  price: number;
  priceText?: string;
  currency: string;
  imageUrl?: string | null;
  description?: string | null;
  note?: string;
};

export type NetworkQuoteValue = {
  total: string;
  priceBreakdown: PriceLine[];
  linkedSourceRevisions: PublicProductQuoteResponse["linkedSourceRevisions"];
};

export type NetworkCartStatus = "CHECKING" | "CURRENT" | "CHANGED" | "INVALID" | "OFFLINE";

export type NetworkCartItem = {
  mode: "NETWORK";
  lineId: string;
  identity: string;
  restaurantSlug: string;
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  currency: string;
  imageUrl?: string | null;
  selection: ProductSelectionV2;
  configurationSnapshot: ConfigurationSnapshotV2;
  selectionKey: string;
  configurationRevision: number;
  runtimeContext: PublicProductQuoteResponse["runtimeContext"];
  acceptedQuote: NetworkQuoteValue;
  proposedQuote?: NetworkQuoteValue;
  proposedSelection?: ProductSelectionV2;
  status: NetworkCartStatus;
  issues: ConfigurationIssue[];
  note?: string;
};

export type CartItem = LegacyCartItem | NetworkCartItem;

/** Enabling the Network flow must not replace the persisted Legacy-only checkout. */
export function shouldUseTrustedWhatsappCheckout(cart: readonly CartItem[], networkFeatureEnabled: boolean): boolean {
  return networkFeatureEnabled && cart.some((line) => line.mode === "NETWORK");
}

const CART_STORAGE_VERSION = 2 as const;
const CHECKOUT_LINE_ID = /^[A-Za-z0-9:_-]{1,128}$/;
let networkLineSequence = 0;

/** A cart line ID is an opaque local identifier, not a pricing or security token. */
export function createNetworkCartLineId(existingIds: readonly string[] = []): string {
  const used = new Set(existingIds);
  let lineId: string;
  do {
    networkLineSequence += 1;
    lineId = `network-${Date.now().toString(36)}-${networkLineSequence.toString(36)}-${Math.random().toString(36).slice(2) || "0"}`;
  } while (used.has(lineId));
  return lineId;
}

export function putLegacyCartItem(cart: readonly CartItem[], product: PublicProduct, price: number, imageUrl: string | null, quantity: number): CartItem[] {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0) return [...cart];
  const existing = cart.find((item): item is LegacyCartItem => item.mode === "LEGACY" && item.slug === product.slug);
  if (quantity === 0) return cart.filter((item) => item !== existing);
  if (existing) return cart.map((item) => item === existing ? {
    ...existing, quantity
  } : item);
  return [...cart, {
    mode: "LEGACY", productId: product.id, lineId: `legacy:${product.slug}`, slug: product.slug, name: product.name,
    quantity, price, priceText: product.basePriceExact ?? String(price), currency: product.currency, imageUrl, description: product.description
  }];
}

export function updateCartLineQuantity(cart: readonly CartItem[], lineId: string, quantity: number): CartItem[] {
  if (!Number.isSafeInteger(quantity)) return [...cart];
  const line = cart.find((item) => item.lineId === lineId);
  if (!line) return [...cart];
  if (quantity > 0 && cart.some((item) => item.mode === "NETWORK")
    && cart.reduce((sum, item) => sum + item.quantity, 0) - line.quantity + quantity > 100) return [...cart];
  return cart.map((item) => item.lineId === lineId ? { ...item, quantity } : item).filter((item) => item.quantity > 0);
}

export function updateCartLineNote(cart: readonly CartItem[], lineId: string, note: string): CartItem[] {
  if (note.length > 500) return [...cart];
  return cart.map((item) => item.lineId === lineId ? { ...item, note } : item);
}

export function cartNeedsPreviewGate(cart: readonly CartItem[], products: readonly PublicProduct[]) {
  const networkSlugs = new Set(products.filter((product) => product.productConfiguration?.mode === "NETWORK").map((product) => product.slug));
  return cart.some((item) => item.mode === "NETWORK" || networkSlugs.has(item.slug));
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function selectionKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 250_000;
}

function quantity(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function money(value: unknown): value is string {
  return validateMoneyString(value, "$cart.total", DEFAULT_ENGINE_LIMITS).length === 0;
}

function sourceVersions(value: unknown): value is PublicProductQuoteResponse["linkedSourceRevisions"] {
  return Array.isArray(value) && value.length <= DEFAULT_ENGINE_LIMITS.maxNodes && value.every((source) =>
    object(source) && nonempty(source.sourceProductId)
    && (source.mode === "NETWORK" || source.mode === "LEGACY")
    && Number.isSafeInteger(source.configurationRevision) && Number(source.configurationRevision) >= 0
  );
}

function priceLines(value: unknown): value is PriceLine[] {
  return Array.isArray(value) && value.length <= DEFAULT_ENGINE_LIMITS.maxNodes && value.every((line) =>
    object(line) && (line.kind === "BASE" || line.kind === "SIZE" || line.kind === "OPTION")
    && typeof line.path === "string" && typeof line.label === "string"
    && money(line.amount) && money(line.chargedAmount) && typeof line.included === "boolean"
  );
}

export function networkCartIdentity(input: {
  restaurantSlug: string;
  currency: string;
  productId: string;
  configurationRevision: number;
  selectionKey: string;
  linkedSourceRevisions: PublicProductQuoteResponse["linkedSourceRevisions"];
  runtimeContext: PublicProductQuoteResponse["runtimeContext"];
}) {
  return JSON.stringify([
    "NETWORK", input.restaurantSlug, input.currency, input.productId,
    input.configurationRevision, input.selectionKey,
    [...input.linkedSourceRevisions]
      .map((source) => [source.sourceProductId, source.mode, source.configurationRevision])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    input.runtimeContext.scope,
    input.runtimeContext.outletDifferentialApplied,
    input.runtimeContext.serviceModeApplied,
    input.runtimeContext.productScheduleApplied
  ]);
}

export function networkCartItemFromQuote(args: {
  product: PublicProduct;
  restaurantSlug: string;
  quote: PublicProductQuoteResponse;
  lineId: string;
}): NetworkCartItem | null {
  const { product, quote } = args;
  if (!product.id || !nonempty(args.lineId) || quote.schemaVersion !== 2
    || quote.productId !== product.id || quote.currency !== product.currency
    || quote.configurationOrderable !== true
    || !money(quote.trustedTotal) || !priceLines(quote.priceBreakdown)
    || !selectionKey(quote.selectionKey) || !sourceVersions(quote.linkedSourceRevisions)
    || !parseProductSelectionV2(quote.canonicalSelection).selection
    || !quote.snapshot || quote.snapshot.snapshotVersion !== 2 || quote.snapshot.productId !== quote.productId
    || quote.snapshot.currency !== quote.currency || quote.snapshot.total !== quote.trustedTotal
    || quote.snapshot.configurationRevision !== quote.configurationRevision
    || quote.snapshot.selectionKey !== quote.selectionKey
    || !parseProductSelectionV2(quote.snapshot.selection).selection
    || JSON.stringify(quote.snapshot.selection) !== JSON.stringify(quote.canonicalSelection)
    || JSON.stringify(quote.snapshot.priceLines) !== JSON.stringify(quote.priceBreakdown)
    || quote.canonicalSelection.productId !== product.id
    || quote.canonicalSelection.configurationRevision !== quote.configurationRevision
    || !quote.runtimeContext || quote.runtimeContext.scope !== "RESTAURANT") return null;

  try {
    if (createSelectionKey(quote.canonicalSelection) !== quote.selectionKey
      || compareMoney(sumMoney(quote.priceBreakdown.map(line => line.chargedAmount)), quote.trustedTotal) !== 0) return null;
  } catch {
    return null;
  }
  const identity = networkCartIdentity({
    restaurantSlug: args.restaurantSlug,
    currency: quote.currency,
    productId: quote.productId,
    configurationRevision: quote.configurationRevision,
    selectionKey: quote.selectionKey,
    linkedSourceRevisions: quote.linkedSourceRevisions,
    runtimeContext: quote.runtimeContext
  });
  return {
    mode: "NETWORK", lineId: args.lineId, identity,
    restaurantSlug: args.restaurantSlug, productId: quote.productId, slug: product.slug,
    name: product.name, quantity: 1, currency: quote.currency,
    imageUrl: product.imageUrl ?? product.images?.[0]?.url ?? null,
    selection: quote.canonicalSelection, configurationSnapshot: quote.snapshot, selectionKey: quote.selectionKey,
    configurationRevision: quote.configurationRevision, runtimeContext: quote.runtimeContext,
    acceptedQuote: { total: quote.trustedTotal, priceBreakdown: quote.priceBreakdown, linkedSourceRevisions: quote.linkedSourceRevisions },
    status: "CURRENT", issues: []
  };
}

export function addOrEditNetworkCartItem(cart: readonly CartItem[], incoming: NetworkCartItem, editingLineId?: string, selectedQuantity?: number): CartItem[] {
  const previous = editingLineId ? cart.find((item) => item.lineId === editingLineId && item.mode === "NETWORK") as NetworkCartItem | undefined : undefined;
  const amount = selectedQuantity ?? previous?.quantity ?? incoming.quantity;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100) return [...cart];
  const other = editingLineId ? cart.filter((item) => item.lineId !== editingLineId) : [...cart];
  const nextNote = incoming.note ?? previous?.note ?? "";
  const matched = other.find((item): item is NetworkCartItem => item.mode === "NETWORK" && item.identity === incoming.identity && (item.note ?? "") === nextNote);
  if (other.reduce((sum, item) => sum + item.quantity, 0) + amount > 100) return [...cart];
  if (matched) return other.map((item) => item.lineId === matched.lineId ? {
    ...incoming, lineId: matched.lineId, note: nextNote, quantity: matched.quantity + amount, acceptedQuote: incoming.acceptedQuote,
    proposedQuote: undefined, status: "CURRENT", issues: []
  } : item);
  const next = { ...incoming, quantity: amount, lineId: previous?.lineId ?? incoming.lineId, note: nextNote };
  if (!previous) return [...other, next];
  const index = cart.findIndex((item) => item.lineId === previous.lineId);
  return [...other.slice(0, index), next, ...other.slice(index)];
}

export function applyNetworkRecheck(item: NetworkCartItem, quote: PublicProductQuoteResponse): NetworkCartItem {
  const refreshed = networkCartItemFromQuote({
    product: { id: item.productId, slug: item.slug, name: item.name, basePrice: null, currency: item.currency },
    restaurantSlug: item.restaurantSlug, quote, lineId: item.lineId
  });
  if (!refreshed || quote.selectionKey !== item.selectionKey) {
    return { ...item, status: "INVALID", proposedQuote: undefined, proposedSelection: undefined, issues: [{ code: "QUOTE_CONTRACT_MISMATCH", path: "$cart", message: "The current quote no longer matches this cart selection." }] };
  }
  if (refreshed.identity !== item.identity || refreshed.acceptedQuote.total !== item.acceptedQuote.total
    || JSON.stringify(refreshed.acceptedQuote.priceBreakdown) !== JSON.stringify(item.acceptedQuote.priceBreakdown)) {
    return { ...item, status: "CHANGED", proposedQuote: refreshed.acceptedQuote, proposedSelection: undefined, issues: [] };
  }
  return { ...item, status: "CURRENT", acceptedQuote: refreshed.acceptedQuote, proposedQuote: undefined, proposedSelection: undefined, issues: [] };
}

function sameChoicePresentation(left: readonly PriceLine[], right: readonly PriceLine[]): boolean {
  return left.length === right.length && left.every((line, index) => {
    const other = right[index];
    return line.kind === other.kind && line.path === other.path && line.nodeId === other.nodeId
      && line.label === other.label && line.instanceId === other.instanceId
      && line.sourceProductId === other.sourceProductId && line.included === other.included;
  });
}

/** A revision-only rebase is safe only when every displayed choice is unchanged. */
export function applyRebasedNetworkRecheck(item: NetworkCartItem, quote: PublicProductQuoteResponse, rebased: ProductSelectionV2): NetworkCartItem {
  const refreshed = networkCartItemFromQuote({
    product: { id: item.productId, slug: item.slug, name: item.name, basePrice: null, currency: item.currency },
    restaurantSlug: item.restaurantSlug, quote, lineId: item.lineId
  });
  if (!refreshed || quote.selectionKey !== createSelectionKey(rebased)
    || !sameChoicePresentation(item.acceptedQuote.priceBreakdown, refreshed.acceptedQuote.priceBreakdown)) {
    return { ...item, status: "INVALID", proposedQuote: undefined, proposedSelection: undefined,
      issues: [{ code: "CONFIGURATION_CHANGED", path: "$cart", message: "Review the current product choices before continuing." }] };
  }
  return { ...item, status: "CHANGED", proposedQuote: refreshed.acceptedQuote,
    proposedSelection: quote.canonicalSelection, issues: [] };
}

export function acceptNetworkRecheck(item: NetworkCartItem, quote: PublicProductQuoteResponse): NetworkCartItem {
  const refreshed = item.proposedSelection
    ? applyRebasedNetworkRecheck(item, quote, item.proposedSelection)
    : applyNetworkRecheck(item, quote);
  if (item.status !== "CHANGED" || !item.proposedQuote || refreshed.status !== "CHANGED"
    || refreshed.proposedQuote?.total !== item.proposedQuote.total
    || JSON.stringify(refreshed.proposedQuote?.priceBreakdown) !== JSON.stringify(item.proposedQuote.priceBreakdown)
    || refreshed.proposedQuote?.linkedSourceRevisions.length !== item.proposedQuote.linkedSourceRevisions.length
    || refreshed.proposedQuote?.linkedSourceRevisions.some((source, index) => {
      const previous = item.proposedQuote?.linkedSourceRevisions[index];
      return !previous || source.sourceProductId !== previous.sourceProductId || source.mode !== previous.mode || source.configurationRevision !== previous.configurationRevision;
    })) return refreshed;
  const candidate = networkCartItemFromQuote({
    product: { id: item.productId, slug: item.slug, name: item.name, basePrice: null, currency: item.currency },
    restaurantSlug: item.restaurantSlug, quote, lineId: item.lineId
  });
  if (!candidate || candidate.selectionKey !== (item.proposedSelection ? createSelectionKey(item.proposedSelection) : item.selectionKey)
    || (!item.proposedSelection && candidate.configurationRevision !== item.configurationRevision)) return refreshed;
  return { ...candidate, quantity: item.quantity, note: item.note };
}

function restoreLegacy(raw: unknown, currency: string): LegacyCartItem | null {
  if (!object(raw) || !nonempty(raw.slug) || !quantity(raw.quantity)
    || typeof raw.price !== "number" || !Number.isFinite(raw.price) || raw.price < 0) return null;
  return {
    mode: "LEGACY", productId: nonempty(raw.productId) ? raw.productId : undefined, lineId: `legacy:${raw.slug}`, slug: raw.slug,
    name: nonempty(raw.name) ? raw.name : raw.slug, quantity: raw.quantity, price: raw.price,
    priceText: money(raw.priceText) ? raw.priceText : String(raw.price),
    currency: nonempty(raw.currency) ? raw.currency : currency,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
    description: typeof raw.description === "string" ? raw.description : null,
    note: typeof raw.note === "string" && raw.note.length <= 500 ? raw.note : undefined
  };
}

function restoreNetwork(raw: unknown, restaurantSlug: string, currency: string): NetworkCartItem | null {
  if (!object(raw) || raw.mode !== "NETWORK" || raw.restaurantSlug !== restaurantSlug
    || !nonempty(raw.lineId) || !nonempty(raw.productId) || !nonempty(raw.slug)
    || !quantity(raw.quantity) || raw.currency !== currency
    || !object(raw.selection) || !Array.isArray(raw.selection.groups)
    || raw.selection.productId !== raw.productId
    || !Number.isSafeInteger(raw.configurationRevision) || raw.selection.configurationRevision !== raw.configurationRevision
    || !selectionKey(raw.selectionKey) || raw.selection.schemaVersion !== 2
    || !parseProductSelectionV2(raw.selection).selection
    || !object(raw.configurationSnapshot) || raw.configurationSnapshot.snapshotVersion !== 2
    || raw.configurationSnapshot.productId !== raw.productId || raw.configurationSnapshot.currency !== currency
    || !object(raw.runtimeContext)
    || raw.runtimeContext.scope !== "RESTAURANT" || !object(raw.acceptedQuote)
    || !money(raw.acceptedQuote.total) || !priceLines(raw.acceptedQuote.priceBreakdown)
    || !sourceVersions(raw.acceptedQuote.linkedSourceRevisions)) return null;
  try {
    if (createSelectionKey(raw.selection as ProductSelectionV2) !== raw.selectionKey) return null;
  } catch {
    return null;
  }
  const runtimeContext = raw.runtimeContext as NetworkCartItem["runtimeContext"];
  const linkedSourceRevisions = raw.acceptedQuote.linkedSourceRevisions;
  return {
    mode: "NETWORK", lineId: raw.lineId,
    identity: networkCartIdentity({ restaurantSlug, currency, productId: raw.productId,
      configurationRevision: raw.configurationRevision as number, selectionKey: raw.selectionKey,
      linkedSourceRevisions, runtimeContext }),
    restaurantSlug, productId: raw.productId, slug: raw.slug,
    name: nonempty(raw.name) ? raw.name : raw.slug, quantity: raw.quantity, currency,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
    selection: raw.selection as ProductSelectionV2, configurationSnapshot: raw.configurationSnapshot as unknown as ConfigurationSnapshotV2, selectionKey: raw.selectionKey,
    configurationRevision: raw.configurationRevision as number, runtimeContext,
    acceptedQuote: { total: raw.acceptedQuote.total, priceBreakdown: raw.acceptedQuote.priceBreakdown as PriceLine[], linkedSourceRevisions },
    status: "CHECKING", issues: [],
    note: typeof raw.note === "string" && raw.note.length <= 500 ? raw.note : undefined
  };
}

export function restoreCartStorage(text: string | null, restaurantSlug: string, currency: string): CartItem[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    const oldItems = Array.isArray(parsed) ? parsed : null;
    const versionedItems = object(parsed) && parsed.version === CART_STORAGE_VERSION && parsed.restaurantSlug === restaurantSlug && Array.isArray(parsed.items)
      ? parsed.items : null;
    const restored = (oldItems ?? versionedItems ?? []).slice(0, 200).flatMap((raw) => {
      const item = oldItems
        ? object(raw) && raw.mode === "NETWORK" ? null : restoreLegacy(raw, currency)
        : object(raw) && raw.mode === "NETWORK"
          ? restoreNetwork(raw, restaurantSlug, currency)
          : object(raw) && raw.mode === "LEGACY" ? restoreLegacy(raw, currency) : null;
      return item ? [item] : [];
    });
    // Older HTTP-origin carts used Math.random() verbatim, including a dot. Give
    // each invalid/duplicate Network line a fresh ID without merging selections.
    const reserved = restored.map((item) => item.lineId);
    const seen = new Set<string>();
    return restored.map((item) => {
      if (item.mode !== "NETWORK" || (CHECKOUT_LINE_ID.test(item.lineId) && !seen.has(item.lineId))) {
        seen.add(item.lineId);
        return item;
      }
      const lineId = createNetworkCartLineId(reserved);
      reserved.push(lineId);
      seen.add(lineId);
      return { ...item, lineId };
    });
  } catch {
    return [];
  }
}

export function serializeCartStorage(items: readonly CartItem[], restaurantSlug: string) {
  return JSON.stringify({ version: CART_STORAGE_VERSION, restaurantSlug, items });
}

/** Catalog evidence is an early UX guard only; checkout must still revalidate on the server.
 * Missing historical identity is retained for review, never rebound by slug or name.
 */
export function cartCatalogReview(items: readonly CartItem[], products: readonly PublicProduct[]): Map<string, string> {
  const byId = new Map(products.filter(p => p.id).map(p => [p.id, p]));
  const issues = new Map<string, string>();
  for (const item of items) {
    const product = item.productId ? byId.get(item.productId) : undefined;
    if (!product || product.slug !== item.slug || product.currency !== item.currency) {
      issues.set(item.lineId, "IDENTITY_CHANGED"); continue;
    }
    if (item.mode === "LEGACY") {
      if (product.productConfiguration || product.basePrice === null) issues.set(item.lineId, "TYPE_CHANGED");
      else if (compareMoney(product.basePriceExact ?? String(product.basePrice), item.priceText ?? String(item.price)) !== 0)
        issues.set(item.lineId, "PRICE_CHANGED");
    }
  }
  return issues;
}

/** Explicit acceptance only. Quantity edits must not accept a changed price or rebind identity. */
export function acceptLegacyCatalogPrice(items: readonly CartItem[], lineId: string, products: readonly PublicProduct[]): CartItem[] {
  if (cartCatalogReview(items, products).get(lineId) !== "PRICE_CHANGED") return [...items];
  return items.map(item => {
    if (item.lineId !== lineId || item.mode !== "LEGACY") return item;
    const product = products.find(p => p.id === item.productId)!;
    return { ...item, price: product.basePrice!, priceText: product.basePriceExact ?? String(product.basePrice) };
  });
}
