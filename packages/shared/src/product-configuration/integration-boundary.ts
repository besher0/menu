/**
* Deprecated V1 entry points retained only to reject historical tools/drafts.
* There is no V1 pricing, conversion or persistence. Customer ordering uses explicit V2 APIs.
* Keep old tools fail-closed until their separately reviewed source retirement.
*/
import type { ConfigurationIssue, ProductConfigurationV1, ProductSelectionV1, ProductConfigurationContext, PriceResult, MinimumPriceResult, SnapshotResult, DependencyEdge, ConfigurationGroup, ProductConfigurationRecord } from "./types";
const pending = (): ConfigurationIssue[] => [{
    code: "UNSUPPORTED_CONFIGURATION_V1", path: "$configuration",
    message: "This V1 entry point is retired. Use the explicit V2 contracts and Unified Product Editor."
  }];
export const validateConfiguration = (_value: ProductConfigurationV1): ConfigurationIssue[] => pending();
export const validateGroupLevels = (_value: ProductConfigurationV1, _resolve?: (id: string) => ProductConfigurationV1 | undefined, _level = 0): ConfigurationIssue[] => pending();
export const validateSelection = (_value: ProductConfigurationV1, _selection: ProductSelectionV1, _context: ProductConfigurationContext): ConfigurationIssue[] => pending();
export const calculatePrice = (_value: ProductConfigurationV1, _selection: ProductSelectionV1, _context: ProductConfigurationContext): PriceResult => ({ valid: false, total: null, baseIgnored: false, lines: [], issues: pending() });
export const calculateMinimumPrice = (_value: ProductConfigurationV1, _context: ProductConfigurationContext): MinimumPriceResult => ({
  orderable: false, minimum: null, maximumRequired: null, display: "UNAVAILABLE", baseIgnored: false, issues: pending()
});
export const createConfigurationSnapshot = (_args: {
  configuration: ProductConfigurationV1;
  selection: ProductSelectionV1;
  context: ProductConfigurationContext;
  productName: string;
  currency: string;
  createdAt: string;
}): SnapshotResult => ({ valid: false, snapshot: null, issues: pending() });
export function createSelectionKey(_selection: ProductSelectionV1): string {
  throw new Error(pending()[0].code);
}
export function collectDependencyEdges(_configuration: ProductConfigurationV1): DependencyEdge[] {
  throw new Error(pending()[0].code);
}
export const validateDependencyGraph = (_records: readonly ProductConfigurationRecord[]): ConfigurationIssue[] => pending();
/** A display-only predicate retained until the editor is replaced. */
export function configurationContainsSize(groups: readonly ConfigurationGroup[]): boolean {
  return groups.some(group => group.type === "SIZE" || group.options.some(option => configurationContainsSize(option.children ?? []) ||
    (option.linkedProduct?.mode === "CUSTOM" && option.linkedProduct.customConfiguration
      ? configurationContainsSize(option.linkedProduct.customConfiguration.groups) : false)));
}
