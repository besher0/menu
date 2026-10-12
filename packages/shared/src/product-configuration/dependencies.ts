import {
  ConfigurationGroup,
  ConfigurationIssue,
  DependencyEdge,
  ProductConfigurationRecord,
  ProductConfigurationV1
} from "./types";

export function collectDependencyEdges(configuration: ProductConfigurationV1): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  function visit(groups: readonly ConfigurationGroup[], path: string) {
    groups.forEach((group, groupIndex) => {
      const groupPath = `${path}.groups[${groupIndex}]`;
      if (group.type === "SIZE") {
        group.sizes.forEach((size, sizeIndex) => visit(size.children ?? [], `${groupPath}.sizes[${sizeIndex}]`));
        return;
      }

      group.options.forEach((option, optionIndex) => {
        const optionPath = `${groupPath}.options[${optionIndex}]`;
        if (option.linkedProduct) {
          edges.push({
            productId: configuration.productId,
            sourceProductId: option.linkedProduct.sourceProductId,
            optionId: option.id,
            path: optionPath,
            mode: option.linkedProduct.mode
          });
          if (option.linkedProduct.mode === "CUSTOM" && option.linkedProduct.customConfiguration) {
            visit(option.linkedProduct.customConfiguration.groups, `${optionPath}.linkedProduct.customConfiguration`);
          }
        }
        visit(option.children ?? [], optionPath);
      });
    });
  }

  visit(configuration.groups, "$configuration");
  return edges;
}

export function validateDependencyGraph(records: readonly ProductConfigurationRecord[]): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const byProduct = new Map<string, ProductConfigurationRecord>();
  const adjacency = new Map<string, DependencyEdge[]>();

  for (const record of records) {
    if (byProduct.has(record.productId)) {
      issues.push({ code: "DUPLICATE_PRODUCT_RECORD", path: record.productId, message: "Dependency input contains a duplicate product record." });
      continue;
    }
    if (record.configuration.productId !== record.productId) {
      issues.push({ code: "CONFIGURATION_PRODUCT_MISMATCH", path: record.productId, message: "Configuration product ID does not match its catalog record." });
    }
    byProduct.set(record.productId, record);
    adjacency.set(record.productId, collectDependencyEdges(record.configuration));
  }

  for (const record of records) {
    for (const edge of adjacency.get(record.productId) ?? []) {
      const target = byProduct.get(edge.sourceProductId);
      if (!target) {
        issues.push({ code: "LINK_TARGET_NOT_FOUND", path: edge.path, message: `Linked product '${edge.sourceProductId}' is not in the catalog input.` });
      } else if (target.catalogId !== record.catalogId) {
        issues.push({ code: "CROSS_CATALOG_LINK", path: edge.path, message: "Linked products must belong to the same catalog/tenant." });
      }
      if (edge.sourceProductId === record.productId) {
        issues.push({ code: "SELF_LINK", path: edge.path, message: "A product cannot link to itself." });
      }
    }
  }

  const state = new Map<string, "VISITING" | "VISITED">();
  const stack: string[] = [];
  const reported = new Set<string>();

  function canonicalCycle(cycle: string[]) {
    const ring = cycle.slice(0, -1);
    const rotations = ring.map((_, index) => [...ring.slice(index), ...ring.slice(0, index)].join("->"));
    return rotations.sort()[0];
  }

  function visit(productId: string) {
    state.set(productId, "VISITING");
    stack.push(productId);
    for (const edge of adjacency.get(productId) ?? []) {
      if (!byProduct.has(edge.sourceProductId)) continue;
      if (state.get(edge.sourceProductId) === "VISITING") {
        const start = stack.indexOf(edge.sourceProductId);
        const cycle = [...stack.slice(start), edge.sourceProductId];
        const key = canonicalCycle(cycle);
        if (!reported.has(key)) {
          reported.add(key);
          issues.push({ code: "LINK_CYCLE", path: edge.path, message: `Linked product cycle detected: ${cycle.join(" -> ")}.` });
        }
      } else if (!state.has(edge.sourceProductId)) {
        visit(edge.sourceProductId);
      }
    }
    stack.pop();
    state.set(productId, "VISITED");
  }

  for (const productId of byProduct.keys()) {
    if (!state.has(productId)) visit(productId);
  }
  return issues;
}
