import { compareMoney, normalizeMoney, sumMoney } from "./money";
import { resolveLinkedConfiguration } from "./resolution";
import { validateSelection } from "./selection";
import {
  ConfigurationGroup,
  ConfigurationIssue,
  GroupSelection,
  MoneyString,
  OptionChoice,
  OptionGroupSelection,
  PriceLine,
  PriceResult,
  ProductConfigurationContext,
  ProductConfigurationV1,
  ProductSelectionV1,
  SizeGroupSelection
} from "./types";

function selectedGroupMap(selections: readonly GroupSelection[]) {
  return new Map(selections.map((selection) => [selection.groupId, selection]));
}

function collectDirectSelectedSizeIds(
  groups: readonly ConfigurationGroup[],
  selections: readonly GroupSelection[],
  inherited: ReadonlySet<string>
) {
  const result = new Set(inherited);
  const selected = selectedGroupMap(selections);
  for (const group of groups) {
    const groupSelection = selected.get(group.id);
    if (group.type === "SIZE" && groupSelection?.type === "SIZE") {
      result.add(groupSelection.sizeChoiceId);
    }
  }
  return result;
}

function effectiveOptionPrice(
  option: OptionChoice,
  selectedSizeIds: ReadonlySet<string>,
  issues: ConfigurationIssue[],
  path: string,
  originalOverlay?: Readonly<Record<string, MoneyString>>
): MoneyString {
  if (originalOverlay) return normalizeMoney(originalOverlay[option.id] ?? "0");
  const defaultPrice = normalizeMoney(option.price);
  const candidates = (option.priceOverrides ?? [])
    .filter((override) => selectedSizeIds.has(override.sizeChoiceId))
    .map((override) => normalizeMoney(override.price ?? defaultPrice));
  if (!candidates.length) return defaultPrice;
  const first = candidates[0];
  if (candidates.some((candidate) => compareMoney(candidate, first) !== 0)) {
    issues.push({ code: "AMBIGUOUS_SIZE_PRICE_OVERRIDE", path, message: "Multiple selected Size contexts resolve this option to different prices." });
  }
  return first;
}

function effectiveSizePrice(
  sizeId: string,
  price: MoneyString,
  originalOverlay?: Readonly<Record<string, MoneyString>>
) {
  return normalizeMoney(originalOverlay ? originalOverlay[sizeId] ?? "0" : price);
}

function configurationContainsResolvedSize(
  configuration: ProductConfigurationV1,
  context: ProductConfigurationContext,
  path: string,
  stack: readonly string[],
  issues: ConfigurationIssue[]
): boolean {
  function visit(groups: readonly ConfigurationGroup[], groupPath: string, productStack: readonly string[]): boolean {
    for (const [groupIndex, group] of groups.entries()) {
      const currentPath = `${groupPath}.groups[${groupIndex}]`;
      if (group.type === "SIZE") return true;
      for (const [optionIndex, option] of group.options.entries()) {
        const optionPath = `${currentPath}.options[${optionIndex}]`;
        if (visit(option.children ?? [], optionPath, productStack)) return true;
        if (option.linkedProduct) {
          const resolved = resolveLinkedConfiguration(option.linkedProduct, context, optionPath, productStack);
          if (resolved.resolved && !resolved.issues.some((issue) => issue.code === "LINK_CYCLE")) {
            if (visit(resolved.resolved.configuration.groups, `${optionPath}.linked`, [...productStack, resolved.resolved.sourceProductId])) return true;
          }
        }
      }
    }
    return false;
  }
  return visit(configuration.groups, path, stack);
}

export function calculatePrice(
  configuration: ProductConfigurationV1,
  selection: ProductSelectionV1,
  context: ProductConfigurationContext
): PriceResult {
  const issues = validateSelection(configuration, selection, context);
  const resolutionIssues: ConfigurationIssue[] = [];
  const baseIgnored = configurationContainsResolvedSize(
    configuration,
    context,
    "$configuration",
    [configuration.productId],
    resolutionIssues
  );
  for (const issue of resolutionIssues) {
    if (!issues.some((existing) => existing.code === issue.code && existing.path === issue.path)) issues.push(issue);
  }
  if (issues.length) return { valid: false, total: null, baseIgnored, lines: [], issues };

  const lines: PriceLine[] = [];

  function priceGroups(
    groups: readonly ConfigurationGroup[],
    selections: readonly GroupSelection[],
    path: string,
    productStack: readonly string[],
    originalOverlay?: Readonly<Record<string, MoneyString>>,
    inheritedSizeIds: ReadonlySet<string> = new Set()
  ) {
    const selected = selectedGroupMap(selections);
    const activeSelectedSizeIds = collectDirectSelectedSizeIds(groups, selections, inheritedSizeIds);
    for (const group of groups) {
      const groupSelection = selected.get(group.id);
      const groupPath = `${path}.${group.id}`;
      if (group.type === "SIZE") {
        const sizeSelection = groupSelection as SizeGroupSelection;
        const size = group.sizes.find((candidate) => candidate.id === sizeSelection.sizeChoiceId)!;
        const amount = effectiveSizePrice(size.id, size.price, originalOverlay);
        lines.push({ kind: "SIZE", path: groupPath, nodeId: size.id, label: size.label, amount, chargedAmount: amount, included: false });
        priceGroups(size.children ?? [], sizeSelection.children ?? [], `${groupPath}.${size.id}`, productStack, originalOverlay, activeSelectedSizeIds);
        continue;
      }

      const optionSelection = groupSelection as OptionGroupSelection | undefined;
      const instances = optionSelection?.instances ?? [];
      const parentLines: Array<{ line: PriceLine; amount: MoneyString }> = [];
      for (const instance of instances) {
        const option = group.options.find((candidate) => candidate.id === instance.optionId)!;
        const instancePath = `${groupPath}.${instance.instanceId}`;
        const amount = effectiveOptionPrice(option, activeSelectedSizeIds, issues, instancePath, originalOverlay);
        const line: PriceLine = {
          kind: "OPTION",
          path: instancePath,
          nodeId: option.id,
          label: option.label,
          instanceId: instance.instanceId,
          sourceProductId: option.linkedProduct?.sourceProductId,
          amount,
          chargedAmount: amount,
          included: false
        };
        lines.push(line);
        parentLines.push({ line, amount });
        priceGroups(option.children ?? [], instance.children ?? [], `${instancePath}.children`, productStack, originalOverlay, activeSelectedSizeIds);

        if (option.linkedProduct && instance.linkedSelection) {
          const resolved = resolveLinkedConfiguration(option.linkedProduct, context, instancePath, productStack).resolved!;
          const linkedOverlay = resolved.mode === "ORIGINAL" ? resolved.originalPriceOverrides : undefined;
          priceGroups(
            resolved.configuration.groups,
            instance.linkedSelection.groups,
            `${instancePath}.linked`,
            [...productStack, resolved.sourceProductId],
            linkedOverlay,
            activeSelectedSizeIds
          );
        }
      }

      parentLines
        .sort((left, right) => {
          const priceOrder = compareMoney(right.amount, left.amount);
          return priceOrder || (left.line.instanceId ?? "").localeCompare(right.line.instanceId ?? "");
        })
        .slice(0, group.includedQuantity)
        .forEach(({ line }) => {
          line.included = true;
          line.chargedAmount = "0";
        });
    }
  }

  if (!baseIgnored && configuration.basePrice !== null) {
    const amount = normalizeMoney(configuration.basePrice);
    lines.push({ kind: "BASE", path: "$configuration.basePrice", nodeId: configuration.productId, label: "Base", amount, chargedAmount: amount, included: false });
  }
  priceGroups(configuration.groups, selection.groups, "$selection.groups", [configuration.productId]);

  if (!baseIgnored && configuration.basePrice === null && !lines.some((line) => line.kind !== "BASE")) {
    issues.push({ code: "MISSING_PRICE_SOURCE", path: "$configuration.basePrice", message: "A null Base requires a selected explicit pricing path; it cannot silently become zero." });
  }
  if (issues.length) return { valid: false, total: null, baseIgnored, lines: [], issues };
  return {
    valid: true,
    total: sumMoney(lines.map((line) => line.chargedAmount)),
    baseIgnored,
    lines,
    issues: []
  };
}
