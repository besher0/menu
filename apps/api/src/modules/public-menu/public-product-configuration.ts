import {
  calculateMinimumPriceV2, collectDependencyEdgesV2, validateConfigurationV2, validateConfigurationCurrencyV2,
  type ConfigurationIssue, type LinkedProductCatalogEntryV2, type ProductConfigurationContextV2, type ProductConfigurationV2
} from "@menu/shared";

export type PublicConfigurationProductRecord = {
  id: string; restaurantId: string; currency: string; slug: string; name: string;
  basePrice: { toString(): string } | string | number | null;
  configurationTree: unknown; configurationVersion: number;
  isActive: boolean; isAvailable: boolean; deletedAt: Date | null;
};
export type PublicLinkedConfigurationSource = {
  productId: string; slug: string; name: string; currency: string;
  mode: "NETWORK" | "LEGACY"; configurationRevision: number;
  available: boolean; orderable: boolean; configuration: ProductConfigurationV2;
};
export type PublicProductConfigurationResponse = {
  schemaVersion: 2; productId: string; productSlug: string; productName: string; currency: string;
  configurationRevision: number; configuration: ProductConfigurationV2;
  linkedProducts: PublicLinkedConfigurationSource[]; orderable: boolean;
  minimumPrice: string | null; maximumRequiredPrice: string | null;
  priceDisplay: "EXACT" | "STARTING_AT" | "UNAVAILABLE"; issues: ConfigurationIssue[];
  runtimeContext: { scope: "RESTAURANT"; outletDifferentialApplied: false; serviceModeApplied: false; productScheduleApplied: false };
};
function canonicalConfiguration(product: PublicConfigurationProductRecord): ProductConfigurationV2 | null {
  const tree = product.configurationTree as ProductConfigurationV2 | null;
  return product.configurationVersion > 0 && tree?.schemaVersion === 2 && tree.productId === product.id
    && tree.revision === product.configurationVersion && Array.isArray(tree.groups) ? tree : null;
}
function runtimeConfiguration(product: PublicConfigurationProductRecord): ProductConfigurationV2 {
  return canonicalConfiguration(product) ?? { schemaVersion: 2, productId: product.id, revision: 1,
    basePrice: product.basePrice?.toString() ?? null, groups: [] };
}
function available(product: PublicConfigurationProductRecord) { return product.deletedAt === null && product.isActive && product.isAvailable; }
function uniqueIssues(issues: ConfigurationIssue[]) {
  const seen = new Set<string>();return issues.filter(issue => { const key = issue.code + ":" + issue.path;return seen.has(key) ? false : (seen.add(key), true); });
}
type PublicCatalogInput = { restaurantId: string; catalogProducts: readonly PublicConfigurationProductRecord[]; capabilityEnabled: boolean; currency: string };
/** One ephemeral same-tenant catalog per request, not a cross-restaurant or persistent cache. */
export function preparePublicConfigurationCatalog(args: PublicCatalogInput) {
  const products = new Map(args.catalogProducts.filter(p => p.restaurantId === args.restaurantId).map(p => [p.id, p]));
  const linkedProducts = new Map<string, LinkedProductCatalogEntryV2>();
  for (const product of products.values()) {
    const configuration = runtimeConfiguration(product), canonical = canonicalConfiguration(product);
    const structurallyValid = validateConfigurationV2(configuration).length === 0 && validateConfigurationCurrencyV2(configuration, args.currency).length === 0;
    // An invalid saved Network tree must never fall back to an ordinary Base price.
    const typeValid = product.configurationVersion === 0 && product.configurationTree === null || !!canonical;
    linkedProducts.set(product.id, { productId: product.id, catalogId: args.restaurantId, configuration,
      available: available(product), orderable: available(product) && product.currency === args.currency && typeValid && structurallyValid
        && args.capabilityEnabled && !(canonical?.basePrice === null && canonical.groups.length === 0) });
  }
  return { products, context: { catalogId: args.restaurantId, currency: args.currency, linkedProducts } satisfies ProductConfigurationContextV2,
    capabilityEnabled: args.capabilityEnabled, currency: args.currency, resolved: new Map<string, PublicProductConfigurationResponse | null>(), minimums: new Map<string,ReturnType<typeof calculateMinimumPriceV2>>() };
}
export function resolvePublicProductConfiguration(args: PublicCatalogInput & { owner: PublicConfigurationProductRecord; preparedCatalog?: ReturnType<typeof preparePublicConfigurationCatalog> }): PublicProductConfigurationResponse | null {
  const catalog = args.preparedCatalog ?? preparePublicConfigurationCatalog(args);
  if (catalog.context.catalogId !== args.restaurantId || catalog.currency !== args.currency || catalog.capabilityEnabled !== args.capabilityEnabled) return null;
  return resolveProductFromCatalog(args.owner, catalog);
}
export function resolveProductFromCatalog(owner: PublicConfigurationProductRecord, catalog: ReturnType<typeof preparePublicConfigurationCatalog>): PublicProductConfigurationResponse | null {
  if (owner.restaurantId !== catalog.context.catalogId || !catalog.products.has(owner.id)) return null;
  if (catalog.resolved.has(owner.id)) return catalog.resolved.get(owner.id)!;
  const tree = canonicalConfiguration(owner);
  if (!tree) { catalog.resolved.set(owner.id, null);return null; }
  const issues = validateConfigurationV2(tree);
  if (!issues.length) issues.push(...validateConfigurationCurrencyV2(tree, catalog.currency));
  const reachable = new Set<string>(), visited = new Set<string>();
  function visit(configuration: ProductConfigurationV2) {
    if (visited.has(configuration.productId)) return;
    if (visited.size >= 1000) { issues.push({ code: "LINKED_SOURCE_LIMIT", path: "$configuration", message: "Linked source safety limit exceeded." });return; }
    visited.add(configuration.productId);
    for (const edge of collectDependencyEdgesV2(configuration)) {
      reachable.add(edge.sourceProductId);
      const source = catalog.products.get(edge.sourceProductId);
      if (edge.mode !== "ORIGINAL") continue;
      if (!source) { issues.push({code:"LINK_TARGET_NOT_FOUND",path:edge.path,message:"Linked source was not found in this restaurant."});continue; }
      const child = canonicalConfiguration(source);
      if (!child) { issues.push({ code: "ORIGINAL_LINKED_SOURCE_REQUIRES_NETWORK_CONFIGURATION", path: edge.path, message: "Original linked source requires a saved V2 configuration." });continue; }
      const invalid = validateConfigurationV2(child);
      if (invalid.length) { issues.push(...invalid);continue; }
      visit(child);
    }
  }
  if (!issues.length) visit(tree);
  if (owner.currency !== catalog.currency) issues.push({ code: "PRODUCT_CURRENCY_MISMATCH", path: "$configuration.currency", message: "Product and restaurant currencies differ." });
  if (!catalog.capabilityEnabled) issues.push({ code: "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE", path: "$configuration", message: "Product Configuration is unavailable." });
  if (!available(owner)) issues.push({ code: "PRODUCT_UNAVAILABLE", path: "$configuration", message: "Product is unavailable." });
  const minimum = !issues.length ? calculateMinimumPriceV2(tree, catalog.context) : null;
  if (minimum) { catalog.minimums.set(owner.id,minimum);issues.push(...minimum.issues); }
  const finalIssues = uniqueIssues(issues), orderable = !!minimum?.orderable && !finalIssues.length;
  const linkedProducts: PublicLinkedConfigurationSource[] = [...reachable].flatMap(id => {
    const product = catalog.products.get(id), resolved = catalog.context.linkedProducts.get(id);
    return !product || !resolved ? [] : [{ productId: id, slug: product.slug, name: product.name, currency: product.currency,
      mode: canonicalConfiguration(product) ? "NETWORK" as const : "LEGACY" as const, configurationRevision: product.configurationVersion,
      available: resolved.available !== false, orderable: resolved.orderable !== false, configuration: resolved.configuration }];
  });
  const result: PublicProductConfigurationResponse = { schemaVersion: 2, productId: owner.id, productSlug: owner.slug, productName: owner.name, currency: catalog.currency,
    configurationRevision: tree.revision, configuration: tree, linkedProducts, orderable,
    minimumPrice: orderable ? minimum!.minimum : null, maximumRequiredPrice: orderable ? minimum!.maximumRequired : null,
    priceDisplay: orderable ? minimum!.display : "UNAVAILABLE", issues: finalIssues,
    runtimeContext: { scope: "RESTAURANT", outletDifferentialApplied: false, serviceModeApplied: false, productScheduleApplied: false } };
  catalog.resolved.set(owner.id, result);return result;
}
