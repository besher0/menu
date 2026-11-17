import { validateConfiguration, validateGroupLevels } from "./validation";
import {
  ConfigurationGroup,
  ConfigurationIssue,
  LinkedProductDefinition,
  ProductConfigurationContext,
  ProductConfigurationV2, LocalPrice
} from "./v2-types";

export type ResolvedLinkedProduct = {
  path: string;
  sourceProductId: string;
  mode: "ORIGINAL" | "CUSTOM";
  configuration: ProductConfigurationV2;
  originalPriceOverrides: Readonly<Record<string, LocalPrice>>;
};

export type ResolvedConfigurationContext = {
  configuration: ProductConfigurationV2;
  linkedConfigurations: ReadonlyMap<string, ResolvedLinkedProduct>;
  issues: ConfigurationIssue[];
};

function collectPriceNodeIds(groups: readonly ConfigurationGroup[], result = new Set<string>()) {
  for (const group of groups) {
    collectPriceNodeIds(group.children ?? [], result);
    if (group.type === "SIZE") {
      for (const size of group.sizes) {
        result.add(size.id);

      }
      continue;
    }
    for (const option of group.options) {
      result.add(option.id);
      collectPriceNodeIds(option.children ?? [], result);
    }
  }
  return result;
}

export function resolveLinkedConfiguration(
  linked: LinkedProductDefinition,
  context: ProductConfigurationContext,
  path: string,
  productStack: readonly string[]
): { resolved?: ResolvedLinkedProduct; issues: ConfigurationIssue[] } {
  const issues: ConfigurationIssue[] = [];
  const source = context.linkedProducts?.get(linked.sourceProductId);
  if (!source) {
    issues.push({ code: "LINK_TARGET_NOT_FOUND", path, message: "Linked source product was not found in the runtime catalog." });
    return { issues };
  }
  if (source.catalogId !== context.catalogId) {
    issues.push({ code: "CROSS_CATALOG_LINK", path, message: "Linked source product belongs to another catalog/tenant." });
  }
  if (source.available === false || source.orderable === false) {
    issues.push({ code: "LINKED_PRODUCT_UNAVAILABLE", path, message: "Linked source product is not currently orderable." });
  }
  if (!source.configuration || source.configuration.productId !== source.productId) {
    issues.push({ code: "LINK_SOURCE_CONFIGURATION_MISMATCH", path, message: "Linked source configuration belongs to another product." });
    return {issues};
  }
  if (productStack.includes(source.productId)) {
    issues.push({ code: "LINK_CYCLE", path, message: `Linked runtime cycle detected: ${[...productStack, source.productId].join(" -> ")}.` });
  }

  let configuration = linked.mode === "CUSTOM" ? linked.customConfiguration : source.configuration;
  if (!configuration) {
    issues.push({ code: "MISSING_LINKED_CONFIGURATION", path, message: "Linked product configuration could not be resolved." });
    return { issues };
  }
  const validationIssues = validateConfiguration(configuration, context.limits);
  if (validationIssues.length) return { issues: [...issues, ...validationIssues] };
  if (linked.mode === "ORIGINAL") {
    const priceNodeIds = collectPriceNodeIds(source.configuration.groups);
    for (const nodeId of Object.keys(linked.originalPriceOverrides ?? {})) {
      if (!priceNodeIds.has(nodeId)) {
        issues.push({ code: "UNKNOWN_ORIGINAL_PRICE_NODE", path: `${path}.originalPriceOverrides.${nodeId}`, message: "Original-mode price override references an unknown live source node." });
      }
    }
  }

  if (linked.mode === "ORIGINAL" && !issues.length) {
    const prices = linked.originalPriceOverrides ?? {};
    const overlay = (groups: readonly ConfigurationGroup[]): ConfigurationGroup[] => groups.map(group => {
      const children = overlay(group.children ?? []);
      if (group.type === "SIZE") return { ...group, children, sizes: group.sizes.map(size => {
        if (prices[size.id]?.priceBySize) issues.push({code:"INVALID_SIZE_PRICING",path,message:"A size cannot have size-dependent pricing."});
        return { ...size, price: prices[size.id]?.price ?? "0" };
      }) };
      return { ...group, children, options: group.options.map(option => ({
        ...option, price: prices[option.id]?.price ?? "0", priceBySize: prices[option.id]?.priceBySize,
        children: overlay(option.children ?? [])
      })) };
    });
    configuration = { ...configuration, basePrice: "0", groups: overlay(configuration.groups) };
    issues.push(...validateConfiguration(configuration, context.limits));
  }
  return {
    resolved: {
      path,
      sourceProductId: source.productId,
      mode: linked.mode,
      configuration,
      originalPriceOverrides: linked.originalPriceOverrides ?? {}
    },
    issues
  };
}

export function resolveConfigurationContext(
  configuration: ProductConfigurationV2,
  context: ProductConfigurationContext
): ResolvedConfigurationContext {
  const linkedConfigurations = new Map<string, ResolvedLinkedProduct>();
  const issues = validateConfiguration(configuration, context.limits);
  if (!issues.length) issues.push(...validateGroupLevels(configuration,id=>context.linkedProducts?.get(id)?.configuration));
  if (issues.length) return {configuration,linkedConfigurations,issues};

  function visit(groups: readonly ConfigurationGroup[], path: string, stack: readonly string[]) {
    groups.forEach((group, groupIndex) => {
      const groupPath = `${path}.groups[${groupIndex}]`;
      visit(group.children ?? [], groupPath + ".children", stack);
      if (group.type === "SIZE") return;
      group.options.forEach((option, optionIndex) => {
        const optionPath = `${groupPath}.options[${optionIndex}]`;
        if (option.linkedProduct) {
          const result = resolveLinkedConfiguration(option.linkedProduct, context, optionPath, stack);
          issues.push(...result.issues);
          if (result.resolved) {
            linkedConfigurations.set(optionPath, result.resolved);
            if (!result.issues.some((issue) => issue.code === "LINK_CYCLE")) {
              visit(result.resolved.configuration.groups, `${optionPath}.linked`, [...stack, result.resolved.sourceProductId]);
            }
          }
        }
        visit(option.children ?? [], optionPath, stack);
      });
    });
  }

  visit(configuration.groups, "$configuration", [configuration.productId]);
  return { configuration, linkedConfigurations, issues };
}
