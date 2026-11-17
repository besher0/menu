import { createConfigurationSnapshotV2, parseProductSelectionV2, type ConfigurationIssue,
  type ConfigurationSnapshotV2, type GroupSelectionV2, type ProductSelectionV2 } from "@menu/shared";
import { preparePublicConfigurationCatalog, resolvePublicProductConfiguration, type PublicConfigurationProductRecord } from "./public-product-configuration";
export { parseProductSelectionV2 as parsePublicQuoteSelection } from "@menu/shared";
export type PublicProductQuoteRequest = { selection: ProductSelectionV2 };
export type PublicQuoteError = { status: 400 | 409; code: string; message: string; issues: ConfigurationIssue[]; currentRevision?: number };
export type PublicProductQuoteResult = { ok: false; error: PublicQuoteError } | { ok: true; quote: {
  schemaVersion: 2; productId: string; configurationRevision: number; selectionKey: string;
  canonicalSelection: ProductSelectionV2; currency: string; trustedTotal: string; baseIgnored: boolean;
  priceBreakdown: ConfigurationSnapshotV2["priceLines"]; snapshot: ConfigurationSnapshotV2;
  linkedSourceRevisions: { sourceProductId: string; mode: "NETWORK" | "LEGACY"; configurationRevision: number }[];
  configurationOrderable: true;
  runtimeContext: { scope: "RESTAURANT"; outletDifferentialApplied: false; serviceModeApplied: false; productScheduleApplied: false };
} };
function canonicalGroups(groups: readonly GroupSelectionV2[]): GroupSelectionV2[] {
  return groups.map(group => group.type === "SIZE" ? { ...group, children: canonicalGroups(group.children ?? []) } : {
    ...group, children: canonicalGroups(group.children ?? []), instances: group.instances.map(unit => ({ ...unit,
      children: canonicalGroups(unit.children ?? []), ...(unit.linkedSelection ? { linkedSelection: canonicalSelection(unit.linkedSelection) } : {})
    })).sort((a,b) => a.instanceId.localeCompare(b.instanceId))
  }).sort((a,b) => a.groupId.localeCompare(b.groupId));
}
function canonicalSelection(selection: ProductSelectionV2): ProductSelectionV2 { return { ...selection, groups: canonicalGroups(selection.groups) }; }
export function quotePublicProductConfiguration(args: {
  restaurantId: string; owner: PublicConfigurationProductRecord; catalogProducts: readonly PublicConfigurationProductRecord[];
  capabilityEnabled: boolean; currency: string; selection: unknown; preparedCatalog?: ReturnType<typeof preparePublicConfigurationCatalog>;
}): PublicProductQuoteResult {
  const parsed = parseProductSelectionV2(args.selection);
  if (!parsed.selection) return { ok: false, error: { status: 400, code: "INVALID_QUOTE_SELECTION", message: "Selection payload is invalid.", issues: parsed.issues } };
  const catalog = args.preparedCatalog ?? preparePublicConfigurationCatalog(args);
  const resolved = resolvePublicProductConfiguration({ ...args, preparedCatalog: catalog });
  if (!resolved) return { ok: false, error: { status: 409, code: "CONFIGURATION_UNAVAILABLE", message: "Current V2 configuration is unavailable.", issues: [] } };
  const currentRevision = resolved.configurationRevision;
  if (parsed.selection.configurationRevision !== currentRevision) return { ok: false, error: {
    status: 409, code: "CONFIGURATION_REVISION_CHANGED", message: "Product configuration changed; review the current choices.", currentRevision,
    issues: [{ code: "STALE_CONFIGURATION_REVISION", path: "$selection.configurationRevision", message: "Selection revision differs from the current configuration." }]
  } };
  if (!resolved.orderable) return { ok: false, error: { status: 409, code: "CONFIGURATION_NOT_ORDERABLE", message: "Current configuration cannot be quoted.", currentRevision, issues: resolved.issues } };
  const selection = canonicalSelection(parsed.selection);
  const result = createConfigurationSnapshotV2({ configuration: resolved.configuration, selection, context: catalog.context,
    productName: args.owner.name, currency: args.currency, createdAt: new Date().toISOString() });
  if (!result.valid || !result.snapshot) {
    const stale = result.issues.some(i => i.code === "STALE_CONFIGURATION_REVISION"), changed = result.issues.some(i => /UNAVAILABLE|LINK_TARGET_NOT_FOUND/.test(i.code));
    return { ok: false, error: { status: stale || changed ? 409 : 400,
      code: stale ? "LINKED_CONFIGURATION_REVISION_CHANGED" : changed ? "CONFIGURATION_CHANGED" : "INVALID_QUOTE_SELECTION",
      message: "Review the current product choices before continuing.", currentRevision, issues: result.issues } };
  }
  const selectedSources = new Set<string>();
  function visit(groups: GroupSelectionV2[]) { for (const group of groups) {
    visit(group.children ?? []);
    if (group.type === "OPTIONS") for (const unit of group.instances) { visit(unit.children ?? []);
      if (unit.linkedSelection) { selectedSources.add(unit.linkedSelection.productId);visit(unit.linkedSelection.groups); }
    }
  } }
  visit(selection.groups);
  const snapshot = result.snapshot;
  return { ok: true, quote: { schemaVersion: 2, productId: args.owner.id, configurationRevision: currentRevision,
    selectionKey: snapshot.selectionKey, canonicalSelection: snapshot.selection, currency: snapshot.currency,
    trustedTotal: snapshot.total, baseIgnored: snapshot.baseIgnored, priceBreakdown: snapshot.priceLines, snapshot,
    linkedSourceRevisions: resolved.linkedProducts.filter(source => selectedSources.has(source.productId)).map(source => ({
      sourceProductId: source.productId, mode: source.mode, configurationRevision: source.configurationRevision
    })).sort((a,b) => a.sourceProductId.localeCompare(b.sourceProductId)), configurationOrderable: true, runtimeContext: resolved.runtimeContext } };
}
