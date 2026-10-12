import {
  ConfigurationGroup,
  ConfigurationIssue,
  LinkedProductDefinition,
  ProductConfigurationContext,
  ProductConfigurationV1
} from "./types";

export type ResolvedLinkedProduct = {
  path: string;
  sourceProductId: string;
  mode: "ORIGINAL" | "CUSTOM";
  configuration: ProductConfigurationV1;
  originalPriceOverrides: Readonly<Record<string, string>>;
};

export type ResolvedConfigurationContext = {
  configuration: ProductConfigurationV1;
  linkedConfigurations: ReadonlyMap<string, ResolvedLinkedProduct>;
  issues: ConfigurationIssue[];
};

function collectPriceNodeIds(groups: readonly ConfigurationGroup[], result = new Set<string>()) {
  for (const group of groups) {
    if (group.type === "SIZE") {
      for (const size of group.sizes) {
        result.add(size.id);
        collectPriceNodeIds(size.children ?? [], result);
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
  if (source.configuration.productId !== source.productId) {
    issues.push({ code: "LINK_SOURCE_CONFIGURATION_MISMATCH", path, message: "Linked source configuration belongs to another product." });
  }
  if (productStack.includes(source.productId)) {
    issues.push({ code: "LINK_CYCLE", path, message: `Linked runtime cycle detected: ${[...productStack, source.productId].join(" -> ")}.` });
  }

  const configuration = linked.mode === "CUSTOM" ? linked.customConfiguration : source.configuration;
  if (!configuration) {
    issues.push({ code: "MISSING_LINKED_CONFIGURATION", path, message: "Linked product configuration could not be resolved." });
    return { issues };
  }
  if (linked.mode === "ORIGINAL") {
    const priceNodeIds = collectPriceNodeIds(source.configuration.groups);
    for (const nodeId of Object.keys(linked.originalPriceOverrides ?? {})) {
      if (!priceNodeIds.has(nodeId)) {
        issues.push({ code: "UNKNOWN_ORIGINAL_PRICE_NODE", path: `${path}.originalPriceOverrides.${nodeId}`, message: "Original-mode price override references an unknown live source node." });
      }
    }
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
  configuration: ProductConfigurationV1,
  context: ProductConfigurationContext
): ResolvedConfigurationContext {
  const linkedConfigurations = new Map<string, ResolvedLinkedProduct>();
  const issues: ConfigurationIssue[] = [];

  function visit(groups: readonly ConfigurationGroup[], path: string, stack: readonly string[]) {
    groups.forEach((group, groupIndex) => {
      const groupPath = `${path}.groups[${groupIndex}]`;
      if (group.type === "SIZE") {
        group.sizes.forEach((size, sizeIndex) => visit(size.children ?? [], `${groupPath}.sizes[${sizeIndex}]`, stack));
        return;
      }
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
