import type { ConfigurationGroup, OptionChoice, SizeGroup } from "./v2-types";
import { normalizeMoney } from "./money";
/** The editor and server share this structural scope, never a global size-ID lookup. */
export function eligibleSizeGroups(groups: readonly ConfigurationGroup[], ancestor?: SizeGroup): SizeGroup[] {
  const siblings = groups.filter((group): group is SizeGroup => group.type === "SIZE");
  return siblings.length ? siblings : ancestor ? [ancestor] : [];
}
export function resolveSizePricingScope(option: OptionChoice, siblings: readonly ConfigurationGroup[], ancestor?: SizeGroup): SizeGroup | undefined {
  return option.priceBySize
    ? eligibleSizeGroups(siblings, ancestor).find(group => group.id === option.priceBySize!.sizeGroupId)
    : undefined;
}
export function effectiveOptionPrice(option: OptionChoice, selectedSizes: ReadonlyMap<string, string>): string {
  if (!option.priceBySize)
    return normalizeMoney(option.price);
  const sizeId = selectedSizes.get(option.priceBySize.sizeGroupId);
  if (!sizeId)
    throw new Error("A validated size pricing scope has no selected size");
  const overrides = option.priceBySize.overrides;
  const value = Object.prototype.hasOwnProperty.call(overrides, sizeId) ? overrides[sizeId] : null;
  return normalizeMoney(value ?? option.price);
}
