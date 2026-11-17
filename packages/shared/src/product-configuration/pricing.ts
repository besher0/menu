import { effectiveOptionPrice } from "./scope";
import { compareMoney, normalizeMoney, sumMoney } from "./money";
import { resolveLinkedConfiguration } from "./resolution";
import { validateSelection } from "./selection";
import {
  ConfigurationGroup,
  ConfigurationIssue,
  GroupSelection,
  MoneyString,
  OptionGroupSelection,
  PriceLine,
  PriceResult,
  ProductConfigurationContext,
  ProductConfigurationV2,
  ProductSelectionV2,
  SizeGroupSelection
} from "./v2-types";

function selectedGroupMap(selections: readonly GroupSelection[]) {
  return new Map(selections.map((selection) => [selection.groupId, selection]));
}

function configurationContainsResolvedSize(
  configuration: ProductConfigurationV2,
  context: ProductConfigurationContext,
  path: string,
  stack: readonly string[],
  issues: ConfigurationIssue[]
): boolean {
  function visit(groups: readonly ConfigurationGroup[], groupPath: string, productStack: readonly string[]): boolean {
    for (const [groupIndex, group] of groups.entries()) {
      const currentPath = `${groupPath}.groups[${groupIndex}]`;
      if (group.type === "SIZE") return true;
      if (visit(group.children ?? [], currentPath + ".children", productStack)) return true;
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
  configuration: ProductConfigurationV2,
  selection: ProductSelectionV2,
  context: ProductConfigurationContext
): PriceResult {
  const issues = validateSelection(configuration, selection, context);
  if (issues.length) {
    return { valid: false, total: null, baseIgnored: false, lines: [], issues };
  }
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
    inheritedSizeIds: ReadonlyMap<string, string> = new Map()
  ) {
    const selected = selectedGroupMap(selections);
    const activeSelectedSizeIds = new Map(inheritedSizeIds);
    for (const group of groups) {
      const current = selected.get(group.id);
      if (group.type === "SIZE" && current?.type === "SIZE") activeSelectedSizeIds.set(group.id, current.sizeChoiceId);
    }
    for (const group of groups) {
      const groupSelection = selected.get(group.id);
      const groupPath = `${path}.${group.id}`;
      if (group.type === "SIZE") {
        const sizeSelection = groupSelection as SizeGroupSelection;
        const size = group.sizes.find((candidate) => candidate.id === sizeSelection.sizeChoiceId)!;
        const amount = normalizeMoney(size.price);
        lines.push({ kind: "SIZE", path: groupPath, nodeId: size.id, label: size.label, amount, chargedAmount: amount, included: false });
        priceGroups(group.children ?? [], sizeSelection.children ?? [], `${groupPath}.${size.id}`, productStack, activeSelectedSizeIds);
        continue;
      }

      const optionSelection = groupSelection as OptionGroupSelection | undefined;
      const instances = optionSelection?.instances ?? [];
      const parentLines: Array<{ line: PriceLine; amount: MoneyString }> = [];
      for (const instance of instances) {
        const option = group.options.find((candidate) => candidate.id === instance.optionId)!;
        const instancePath = `${groupPath}.${instance.instanceId}`;
        const amount = effectiveOptionPrice(option, activeSelectedSizeIds);
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
        priceGroups(option.children ?? [], instance.children ?? [], `${instancePath}.children`, productStack, activeSelectedSizeIds);

        if (option.linkedProduct && instance.linkedSelection) {
          const resolved = resolveLinkedConfiguration(option.linkedProduct, context, instancePath, productStack).resolved!;
          priceGroups(
            resolved.configuration.groups,
            instance.linkedSelection.groups,
            `${instancePath}.linked`,
            [...productStack, resolved.sourceProductId],
            new Map()
          );
        }
      }

      if (instances.length) priceGroups(group.children ?? [], optionSelection?.children ?? [], groupPath + ".children", productStack, activeSelectedSizeIds);
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
