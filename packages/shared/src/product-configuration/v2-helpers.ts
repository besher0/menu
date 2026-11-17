import type { ConfigurationGroup, ConfigurationIssue, ProductConfigurationV2, ProductSelectionV2, ProductConfigurationContext, GroupSelection } from "./v2-types";
import { validateConfiguration, validateGroupLevels, resolveEngineLimits } from "./validation";
import { resolveLinkedConfiguration } from "./resolution";
import { validateCurrencyAmount, currencyDisplayScale } from "../currency-policy";
import { normalizeMoney } from "./money";
/** Validate all actual prices, including local ORIGINAL overlays and CUSTOM snapshots. */
export function validateConfigurationCurrencyV2(config: ProductConfigurationV2, currency: string): ConfigurationIssue[] {
  const issues = validateConfiguration(config);
  if (issues.length)
    return issues;
  function price(value: string, path: string) {
    issues.push(...validateCurrencyAmount(value, currency, path));
    if (currencyDisplayScale(currency) === 2 && (normalizeMoney(value).split(".")[1]?.length ?? 0) > 2) {
      issues.push({ code: "CURRENCY_SCALE_EXCEEDED", path, message: "This currency permits at most two decimal places." });
    }
  }
  function visit(tree: ProductConfigurationV2, path: string) {
    if (tree.basePrice !== null)
      price(tree.basePrice, path + ".basePrice");
    function groups(list: readonly ConfigurationGroup[], path: string) {
      for (const group of list) {
        const gp = path + "." + group.id;
        groups(group.children ?? [], gp + ".children");
        if (group.type === "SIZE") {
          for (const size of group.sizes)
            price(size.price, gp + "." + size.id);
        }
        else
          for (const option of group.options) {
            price(option.price, gp + "." + option.id);
            for (const value of Object.values(option.priceBySize?.overrides ?? {}))
              if (value !== null)
                price(value, gp);
            groups(option.children ?? [], gp + "." + option.id);
            const linked = option.linkedProduct;
            if (linked?.mode === "CUSTOM" && linked.customConfiguration)
              visit(linked.customConfiguration, gp + ".custom");
            if (linked?.mode === "ORIGINAL")
              for (const local of Object.values(linked.originalPriceOverrides ?? {})) {
                price(local.price, gp);
                for (const value of Object.values(local.priceBySize?.overrides ?? {}))
                  if (value !== null)
                    price(value, gp);
              }
          }
      }
    }
    groups(tree.groups, path + ".groups");
  }
  visit(config, "$configuration");
  return issues;
}
/** Explicit CUSTOM copy. IDs owned by external ORIGINAL sources are not remapped. */
export function cloneCustomConfigurationV2(config: ProductConfigurationV2, newId: () => string): ProductConfigurationV2 {
  const issues = validateConfiguration(config);
  if (issues.length)
    throw new Error("Cannot clone an invalid configuration: " + issues[0].code);
  const copy = JSON.parse(JSON.stringify(config)) as ProductConfigurationV2;
  function clone(tree: ProductConfigurationV2) {
    const ids = new Map<string, string>();
    const claimed = new Set<string>();
    function allocate(old: string) {
      const value = newId();
      if (typeof value !== "string" || !value.trim() || claimed.has(value))
        throw new Error("ID factory returned an invalid or duplicate ID");
      ids.set(old, value);
      claimed.add(value);
      return value;
    }
    function walk(groups: ConfigurationGroup[]) {
      for (const group of groups) {
        group.id = allocate(group.id);
        walk(group.children ?? []);
        if (group.type === "SIZE")
          for (const size of group.sizes)
            size.id = allocate(size.id);
        else
          for (const option of group.options) {
            option.id = allocate(option.id);
            walk(option.children ?? []);
            if (option.linkedProduct?.mode === "CUSTOM" && option.linkedProduct.customConfiguration)
              clone(option.linkedProduct.customConfiguration);
          }
      }
    }
    walk(tree.groups);
    function remap(groups: ConfigurationGroup[]) {
      for (const group of groups) {
        remap(group.children ?? []);
        if (group.type === "SIZE")
          continue;
        for (const option of group.options) {
          if (option.priceBySize)
            option.priceBySize = {
              sizeGroupId: ids.get(option.priceBySize.sizeGroupId)!,
              overrides: Object.fromEntries(Object.entries(option.priceBySize.overrides).map(([id, price]) => [ids.get(id)!, price]))
            };
          remap(option.children ?? []);
        }
      }
    }
    remap(tree.groups);
  }
  clone(copy);
  return copy;
}
/** Adds only forced anonymous single units. Optional choices are never inferred. */
export function completeAnonymousSelectionV2(config: ProductConfigurationV2, selection: ProductSelectionV2, context: ProductConfigurationContext): {
  selection: ProductSelectionV2;
  issues: ConfigurationIssue[];
} {
  const issues = validateConfiguration(config, context.limits);
  if (!issues.length)
    issues.push(...validateGroupLevels(config, id => context.linkedProducts?.get(id)?.configuration));
  if (issues.length)
    return { selection, issues };
  let copy: ProductSelectionV2;
  try {
    copy = JSON.parse(JSON.stringify(selection)) as ProductSelectionV2;
  }
  catch {
    return { selection, issues: [{ code: "INVALID_SELECTION", path: "$selection", message: "Selection must be JSON." }] };
  }
  const limits = resolveEngineLimits(context.limits);
  const usedIds = new Set<string>();
  let visited = 0;
  function reserve(groups: GroupSelection[], depth = 0) {
    if (!Array.isArray(groups) || depth > limits.maxDepth || groups.length > limits.maxNodes) {
      issues.push({ code: "INVALID_SELECTION", path: "$selection", message: "Invalid selection shape or depth." });
      return;
    }
    for (const group of groups) {
      if (!group || ++visited > limits.maxNodes) {
        issues.push({ code: "INVALID_SELECTION", path: "$selection", message: "Selection budget exceeded." });
        return;
      }
      reserve(group.children ?? [], depth + 1);
      if (group.type !== "OPTIONS")
        continue;
      if (!Array.isArray(group.instances) || group.instances.length > limits.maxSelectionInstances) {
        issues.push({ code: "INVALID_INSTANCES", path: "$selection", message: "Invalid selected units." });
        return;
      }
      for (const instance of group.instances) {
        if (!instance || typeof instance.instanceId !== "string" || usedIds.has(instance.instanceId)) {
          issues.push({ code: "DUPLICATE_SELECTION_INSTANCE_ID", path: "$selection", message: "Invalid or duplicate unit ID." });
          return;
        }
        usedIds.add(instance.instanceId);
        if (usedIds.size > limits.maxSelectionInstances) {
          issues.push({ code: "SELECTION_INSTANCE_LIMIT_EXCEEDED", path: "$selection", message: "Too many units." });
          return;
        }
        reserve(instance.children ?? [], depth + 1);
        if (instance.linkedSelection)
          reserve(instance.linkedSelection.groups, depth + 1);
      }
    }
  }
  reserve(copy?.groups);
  if (issues.length)
    return { selection, issues };
  let allocated = 0;
  function nextId() {
    let id: string;
    do {
      id = "auto:" + (++allocated);
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  }
  function complete(tree: ProductConfigurationV2, selected: ProductSelectionV2, stack: string[], path: string) {
    if (selected.schemaVersion !== 2 || selected.productId !== tree.productId || selected.configurationRevision !== tree.revision || !Array.isArray(selected.groups)) {
      issues.push({ code: "INVALID_SELECTION", path, message: "Completion requires a current V2 selection." });
      return;
    }
    function groups(defs: readonly ConfigurationGroup[], choices: GroupSelection[], path: string) {
      for (const group of defs) {
        let picked = choices.find(s => s.groupId === group.id);
        if (group.available === false)
          continue;
        if (group.type === "SIZE") {
          const sizeId = picked?.type === "SIZE" ? picked.sizeChoiceId : undefined;
          if (picked?.type === "SIZE" && group.sizes.some(s => s.id === sizeId && s.available !== false)) {
            picked.children ??= [];
            groups(group.children ?? [], picked.children, path + "." + group.id);
          }
          continue;
        }
        const candidates = group.options.filter(o => o.available !== false);
        const option = candidates[0];
        if (group.hidePublicLabel && group.min === 1 && group.max === 1 && candidates.length === 1 &&
          (option.minQuantity ?? 0) <= 1 && (option.maxQuantity === null || option.maxQuantity >= 1) &&
          (!picked || picked.type === "OPTIONS" && picked.instances.length === 0)) {
          if (usedIds.size >= limits.maxSelectionInstances) {
            issues.push({ code: "SELECTION_INSTANCE_LIMIT_EXCEEDED", path, message: "Completion budget exceeded." });
            return;
          }
          picked = { type: "OPTIONS", groupId: group.id, instances: [{ instanceId: nextId(), optionId: option.id, children: [] }] };
          const at = choices.findIndex(s => s.groupId === group.id);
          if (at < 0)
            choices.push(picked);
          else
            choices[at] = picked;
        }
        if (picked?.type !== "OPTIONS" || !picked.instances.length)
          continue;
        picked.children ??= [];
        groups(group.children ?? [], picked.children, path + "." + group.id);
        for (const instance of picked.instances) {
          const option = group.options.find(o => o.id === instance.optionId && o.available !== false);
          if (!option)
            continue;
          instance.children ??= [];
          groups(option.children ?? [], instance.children, path + "." + instance.instanceId);
          if (option.linkedProduct) {
            const resolved = resolveLinkedConfiguration(option.linkedProduct, context, path, stack);
            issues.push(...resolved.issues);
            if (!resolved.resolved || resolved.issues.length)
              continue;
            const linked = resolved.resolved.configuration;
            instance.linkedSelection ??= { schemaVersion: 2, productId: linked.productId, configurationRevision: linked.revision, groups: [] };
            complete(linked, instance.linkedSelection, [...stack, linked.productId], path + "." + instance.instanceId + ".linked");
          }
        }
      }
    }
    groups(tree.groups, selected.groups, path);
  }
  complete(config, copy, [config.productId], "$selection");
  return { selection: copy, issues };
}
