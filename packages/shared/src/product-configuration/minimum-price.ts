import { calculatePrice } from "./pricing";
import { compareMoney } from "./money";
import { resolveLinkedConfiguration } from "./resolution";
import {
  ConfigurationGroup,
  ConfigurationIssue,
  GroupSelection,
  MinimumPriceResult,
  OptionChoice,
  OptionSelectionInstance,
  ProductConfigurationContext,
  ProductConfigurationV1,
  ProductSelectionV1,
  PRODUCT_SELECTION_SCHEMA_VERSION
} from "./types";
import { resolveEngineLimits, validateConfiguration } from "./validation";

type MaybeGroupSelection = GroupSelection | undefined;

function uniqueIssues(issues: readonly ConfigurationIssue[]): ConfigurationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}\u0000${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Enumerates only the units required by group/option minima. Optional upsells are
 * deliberately excluded, so they cannot turn a directly purchasable Base into
 * a misleading "starting at" price.
 */
export function calculateMinimumPrice(
  configuration: ProductConfigurationV1,
  context: ProductConfigurationContext
): MinimumPriceResult {
  const limits = resolveEngineLimits(context.limits);
  const issues = validateConfiguration(configuration, limits);
  let generatedStates = 0;
  let stateLimitReached = false;

  function countState<T>(value: T): T | undefined {
    generatedStates += 1;
    if (generatedStates <= limits.maxMinimumPriceStates) return value;
    if (!stateLimitReached) {
      issues.push({
        code: "MINIMUM_PRICE_STATE_LIMIT_EXCEEDED",
        path: "$configuration",
        message: "Minimum-price enumeration exceeded the configured safety limit."
      });
      stateLimitReached = true;
    }
    return undefined;
  }

  function combine<T>(sets: readonly (readonly T[])[]): T[][] {
    let rows: T[][] = [[]];
    for (const set of sets) {
      const next: T[][] = [];
      for (const row of rows) {
        for (const value of set) {
          const candidate = countState([...row, value]);
          if (candidate) next.push(candidate);
          if (stateLimitReached) return [];
        }
      }
      rows = next;
    }
    return rows;
  }

  function enumerateAllocations(group: Extract<ConfigurationGroup, { type: "OPTIONS" }>): number[][] {
    const effectiveMax = group.max ?? limits.maxQuantityPerGroup;
    const minima = group.options.map((option) => option.minQuantity ?? 0);
    if (group.options.some((option, index) => option.available === false && minima[index] > 0)) return [];
    const requiredTotal = Math.max(group.min, minima.reduce((total, value) => total + value, 0));
    if (requiredTotal > effectiveMax) return [];

    const results: number[][] = [];
    function visit(index: number, remaining: number, current: number[]) {
      if (stateLimitReached) return;
      if (index === group.options.length) {
        if (remaining === 0) {
          const state = countState([...current]);
          if (state) results.push(state);
        }
        return;
      }

      const option = group.options[index];
      const minimum = option.available === false ? 0 : minima[index];
      const maximum = option.available === false ? 0 : Math.min(option.maxQuantity, remaining);
      for (let quantity = minimum; quantity <= maximum; quantity += 1) {
        current.push(quantity);
        visit(index + 1, remaining - quantity, current);
        current.pop();
      }
    }
    visit(0, requiredTotal, []);
    return results;
  }

  function enumerateProduct(
    config: ProductConfigurationV1,
    path: string,
    productStack: readonly string[]
  ): ProductSelectionV1[] {
    return enumerateGroups(config.groups, path, productStack).map((groups) => ({
      schemaVersion: PRODUCT_SELECTION_SCHEMA_VERSION,
      productId: config.productId,
      configurationRevision: config.revision,
      groups
    }));
  }

  function enumerateOptionUnit(
    option: OptionChoice,
    path: string,
    productStack: readonly string[]
  ): Array<Pick<OptionSelectionInstance, "children" | "linkedSelection">> {
    const childSelections = enumerateGroups(option.children ?? [], `${path}.children`, productStack);
    if (!option.linkedProduct) return childSelections.map((children) => ({ children }));

    const resolved = resolveLinkedConfiguration(option.linkedProduct, context, `${path}.linkedProduct`, productStack);
    issues.push(...resolved.issues);
    if (!resolved.resolved || resolved.issues.length) return [];
    const linkedSelections = enumerateProduct(
      resolved.resolved.configuration,
      `${path}.linked`,
      [...productStack, resolved.resolved.sourceProductId]
    );
    const variants: Array<Pick<OptionSelectionInstance, "children" | "linkedSelection">> = [];
    for (const children of childSelections) {
      for (const linkedSelection of linkedSelections) {
        const state = countState({ children, linkedSelection });
        if (state) variants.push(state);
      }
    }
    return variants;
  }

  function enumerateGroup(
    group: ConfigurationGroup,
    path: string,
    productStack: readonly string[]
  ): MaybeGroupSelection[] {
    if (group.type === "SIZE") {
      if (group.available === false) return [];
      const selections: MaybeGroupSelection[] = [];
      group.sizes.forEach((size, sizeIndex) => {
        if (size.available === false) return;
        const childSelections = enumerateGroups(size.children ?? [], `${path}.sizes[${sizeIndex}]`, productStack);
        childSelections.forEach((children) => {
          const state = countState<GroupSelection>({
            type: "SIZE",
            groupId: group.id,
            sizeChoiceId: size.id,
            children
          });
          if (state) selections.push(state);
        });
      });
      return selections;
    }

    if (group.available === false) {
      const requiredMinimum = Math.max(
        group.min,
        group.options.reduce((total, option) => total + (option.minQuantity ?? 0), 0)
      );
      return requiredMinimum === 0 ? [undefined] : [];
    }
    const allocations = enumerateAllocations(group);
    const selections: MaybeGroupSelection[] = [];
    allocations.forEach((allocation, allocationIndex) => {
      if (allocation.every((quantity) => quantity === 0)) {
        selections.push(undefined);
        return;
      }

      const unitSets: Array<Array<{ option: OptionChoice; unit: number; variant: Pick<OptionSelectionInstance, "children" | "linkedSelection"> }>> = [];
      group.options.forEach((option, optionIndex) => {
        for (let unit = 0; unit < allocation[optionIndex]; unit += 1) {
          const variants = enumerateOptionUnit(option, `${path}.options[${optionIndex}].units[${unit}]`, productStack);
          unitSets.push(variants.map((variant) => ({ option, unit, variant })));
        }
      });

      combine(unitSets).forEach((units) => {
        const instances = units.map(({ option, unit, variant }, index): OptionSelectionInstance => ({
          instanceId: `${path}:a${allocationIndex}:u${index}:${option.id}:${unit}`,
          optionId: option.id,
          ...(variant.children?.length ? { children: variant.children } : {}),
          ...(variant.linkedSelection ? { linkedSelection: variant.linkedSelection } : {})
        }));
        const state = countState<GroupSelection>({ type: "OPTIONS", groupId: group.id, instances });
        if (state) selections.push(state);
      });
    });
    return selections;
  }

  function enumerateGroups(
    groups: readonly ConfigurationGroup[],
    path: string,
    productStack: readonly string[]
  ): GroupSelection[][] {
    if (!groups.length) return [[]];
    const alternatives = groups.map((group, index) => enumerateGroup(group, `${path}.groups[${index}]`, productStack));
    if (alternatives.some((values) => values.length === 0)) return [];
    return combine(alternatives).map((row) => row.filter((value): value is GroupSelection => value !== undefined));
  }

  if (issues.length) {
    return { orderable: false, minimum: null, maximumRequired: null, display: "UNAVAILABLE", baseIgnored: false, issues: uniqueIssues(issues) };
  }

  const selections = enumerateProduct(configuration, "$minimum", [configuration.productId]);
  const totals: string[] = [];
  let baseIgnored = false;
  for (const selection of selections) {
    const result = calculatePrice(configuration, selection, context);
    baseIgnored ||= result.baseIgnored;
    if (result.valid && result.total !== null) totals.push(result.total);
    else issues.push(...result.issues);
  }

  if (!totals.length || stateLimitReached) {
    if (!issues.length) {
      issues.push({ code: "UNSATISFIABLE_CONFIGURATION", path: "$configuration", message: "No current valid required configuration exists." });
    }
    return { orderable: false, minimum: null, maximumRequired: null, display: "UNAVAILABLE", baseIgnored, issues: uniqueIssues(issues) };
  }

  let minimum = totals[0];
  let maximum = totals[0];
  totals.slice(1).forEach((total) => {
    if (compareMoney(total, minimum) < 0) minimum = total;
    if (compareMoney(total, maximum) > 0) maximum = total;
  });
  return {
    orderable: true,
    minimum,
    maximumRequired: maximum,
    display: compareMoney(minimum, maximum) === 0 ? "EXACT" : "STARTING_AT",
    baseIgnored,
    issues: []
  };
}
