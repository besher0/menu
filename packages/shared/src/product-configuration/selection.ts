import {
  ConfigurationGroup,
  ConfigurationIssue,
  GroupSelection,
  OptionGroupSelection,
  ProductConfigurationContext,
  ProductConfigurationV2,
  ProductSelectionV2,
  PRODUCT_SELECTION_SCHEMA_VERSION,
  SizeGroupSelection
} from "./v2-types";
import { resolveEngineLimits, validateConfiguration, validateGroupLevels } from "./validation";
import { resolveLinkedConfiguration } from "./resolution";
import { validateConfigurationCurrencyV2 } from "./v2-helpers";

export function validateSelection(
  configuration: ProductConfigurationV2,
  selection: ProductSelectionV2,
  context: ProductConfigurationContext
): ConfigurationIssue[] {
  if (!context || typeof context !== "object" || !context.catalogId || !context.currency) {
    return [{code:"INVALID_CONTEXT",path:"$context",message:"Catalog and currency are required."}];
  }
  const limits = resolveEngineLimits(context.limits);
  const issues = [...validateConfiguration(configuration, limits)];
  if (!issues.length && context.linkedProducts?.size) issues.push(...validateGroupLevels(configuration, id => context.linkedProducts?.get(id)?.configuration));
  if (issues.length) return issues;
  issues.push(...validateConfigurationCurrencyV2(configuration, context.currency));
  if (issues.length) return issues;
  if (!selection || typeof selection !== "object") return [{code:"INVALID_SELECTION",path:"$selection",message:"Invalid selection."}];
  const instanceIds = new Set<string>();
  let instanceCount = 0;

  function validateProductSelection(
    config: ProductConfigurationV2,
    selected: ProductSelectionV2,
    path: string,
    productStack: readonly string[]
  ) {
    if (selected.schemaVersion !== PRODUCT_SELECTION_SCHEMA_VERSION) {
      issues.push({ code: "UNSUPPORTED_SELECTION_VERSION", path: `${path}.schemaVersion`, message: "Unsupported selection schema version." });
    }
    if (selected.productId !== config.productId) {
      issues.push({ code: "SELECTION_PRODUCT_MISMATCH", path: `${path}.productId`, message: "Selection belongs to another product." });
    }
    if (selected.configurationRevision !== config.revision) {
      issues.push({ code: "STALE_CONFIGURATION_REVISION", path: `${path}.configurationRevision`, message: "Selection revision does not match the current configuration." });
    }
    if (!Array.isArray(selected.groups)) {
      issues.push({ code: "INVALID_GROUP_SELECTIONS", path: `${path}.groups`, message: "Selected groups must be an array." });
      return;
    }
    validateGroups(config.groups, selected.groups, `${path}.groups`, productStack);
  }

  function validateGroups(
    groups: readonly ConfigurationGroup[],
    selections: readonly GroupSelection[],
    path: string,
    productStack: readonly string[]
  ) {
    if (!Array.isArray(selections) || selections.length > limits.maxNodes ||
        selections.some(s => !s || typeof s !== "object" || typeof s.groupId !== "string")) {
      issues.push({code:"INVALID_GROUP_SELECTIONS",path,message:"Invalid or excessive selections."}); return;
    }
    const byGroup = new Map<string, GroupSelection>();
    selections.forEach((groupSelection, index) => {
      if (byGroup.has(groupSelection.groupId)) {
        issues.push({ code: "DUPLICATE_GROUP_SELECTION", path: `${path}[${index}]`, message: "A group can appear only once in one selection scope." });
      }
      byGroup.set(groupSelection.groupId, groupSelection);
    });
    const knownGroupIds = new Set(groups.map((group) => group.id));
    selections.forEach((groupSelection, index) => {
      if (!knownGroupIds.has(groupSelection.groupId)) {
        issues.push({ code: "UNKNOWN_GROUP_SELECTION", path: `${path}[${index}]`, message: "Selection references an unknown group." });
      }
    });

    for (const group of groups) {
      const selected = byGroup.get(group.id);
      const groupPath = `${path}.${group.id}`;
      if (group.type === "SIZE") {
        validateSizeGroup(group, selected, groupPath, productStack);
      } else {
        validateOptionGroup(group, selected, groupPath, productStack);
      }
    }
  }

  function validateSizeGroup(
    group: Extract<ConfigurationGroup, { type: "SIZE" }>,
    selected: GroupSelection | undefined,
    path: string,
    productStack: readonly string[]
  ) {
    if (group.available === false) {
      issues.push({ code: "REQUIRED_SIZE_GROUP_UNAVAILABLE", path, message: "A Size group is unavailable, so the configuration is unsatisfiable." });
      return;
    }
    if (!selected) {
      issues.push({ code: "SIZE_REQUIRED", path, message: "Exactly one Size must be selected." });
      return;
    }
    if (selected.type !== "SIZE") {
      issues.push({ code: "GROUP_SELECTION_TYPE_MISMATCH", path, message: "Expected a Size group selection." });
      return;
    }
    const sizeSelection = selected as SizeGroupSelection;
    const size = group.sizes.find((candidate) => candidate.id === sizeSelection.sizeChoiceId);
    if (!size) {
      issues.push({ code: "UNKNOWN_SIZE_SELECTION", path, message: "Selected Size does not exist." });
      return;
    }
    if (size.available === false) {
      issues.push({ code: "SIZE_UNAVAILABLE", path, message: "Selected Size is unavailable." });
    }
    validateGroups(group.children ?? [], sizeSelection.children ?? [], `${path}.children`, productStack);
  }

  function validateOptionGroup(
    group: Extract<ConfigurationGroup, { type: "OPTIONS" }>,
    selected: GroupSelection | undefined,
    path: string,
    productStack: readonly string[]
  ) {
    if (selected && selected.type !== "OPTIONS") {
      issues.push({ code: "GROUP_SELECTION_TYPE_MISMATCH", path, message: "Expected an Options group selection." });
      return;
    }
    const optionSelection = selected as OptionGroupSelection | undefined;
    if (optionSelection && !Array.isArray(optionSelection.instances)) {
      issues.push({code:"INVALID_INSTANCES",path,message:"Instances must be an array."}); return;
    }
    const instances = optionSelection?.instances ?? [];
    const effectiveMax = group.max ?? limits.maxQuantityPerGroup;
    const requiredMinimum = Math.max(
      group.min,
      group.options.reduce((total, option) => total + (option.minQuantity ?? 0), 0)
    );

    if (group.available === false) {
      if (requiredMinimum > 0) {
        issues.push({ code: "REQUIRED_OPTIONS_GROUP_UNAVAILABLE", path, message: "A required Options group is unavailable." });
      }
      if (instances.length || optionSelection?.children?.length) {
        issues.push({ code: "OPTIONS_GROUP_UNAVAILABLE", path, message: "Selections cannot be made in an unavailable group." });
      }
      return;
    }
    if (instances.length < group.min) {
      issues.push({ code: "GROUP_MIN_NOT_MET", path, message: `Options group requires at least ${group.min} selected units.` });
    }
    if (instances.length > effectiveMax) {
      issues.push({ code: "GROUP_MAX_EXCEEDED", path, message: `Options group allows at most ${effectiveMax} selected units.` });
    }

    if (instances.length > limits.maxSelectionInstances) {
      issues.push({code:"SELECTION_INSTANCE_LIMIT_EXCEEDED",path,message:"Too many instances."}); return;
    }
    if (instances.length) validateGroups(group.children ?? [], optionSelection?.children ?? [], path + ".children", productStack);
    else if (optionSelection?.children?.length) issues.push({code:"INACTIVE_SHARED_SELECTION",path,message:"An inactive group has no shared selections."});
    const counts = new Map<string, number>();
    instances.forEach((instance, index) => {
      const instancePath = `${path}.instances[${index}]`;
      if (!instance || typeof instance !== "object") {
        issues.push({code:"INVALID_INSTANCE",path:instancePath,message:"Invalid selected unit."}); return;
      }
      instanceCount += 1;
      if (instanceCount > limits.maxSelectionInstances) {
        issues.push({ code: "SELECTION_INSTANCE_LIMIT_EXCEEDED", path: instancePath, message: "Selection instance safety limit exceeded." });
        return;
      }
      if (typeof instance.instanceId !== "string" || !instance.instanceId.trim() || instance.instanceId.length > 512) {
        issues.push({ code: "MISSING_SELECTION_INSTANCE_ID", path: `${instancePath}.instanceId`, message: "Every selected unit requires a stable instance ID." });
      } else if (instanceIds.has(instance.instanceId)) {
        issues.push({ code: "DUPLICATE_SELECTION_INSTANCE_ID", path: `${instancePath}.instanceId`, message: "Selection instance IDs must be globally unique." });
      } else {
        instanceIds.add(instance.instanceId);
      }

      const option = group.options.find((candidate) => candidate.id === instance.optionId);
      if (!option) {
        issues.push({ code: "UNKNOWN_OPTION_SELECTION", path: instancePath, message: "Selected option does not exist." });
        return;
      }
      counts.set(option.id, (counts.get(option.id) ?? 0) + 1);
      if (option.available === false) {
        issues.push({ code: "OPTION_UNAVAILABLE", path: instancePath, message: "Selected option is unavailable." });
      }
      validateGroups(option.children ?? [], instance.children ?? [], `${instancePath}.children`, productStack);

      if (!option.linkedProduct && instance.linkedSelection) {
        issues.push({ code: "UNEXPECTED_LINKED_SELECTION", path: instancePath, message: "A normal option cannot contain a linked product selection." });
      }
      if (option.linkedProduct) {
        const resolved = resolveLinkedConfiguration(option.linkedProduct, context, instancePath, productStack);
        issues.push(...resolved.issues);
        if (!resolved.resolved) return;
        const linkedConfig = resolved.resolved.configuration;
        issues.push(...validateConfigurationCurrencyV2(linkedConfig, context.currency));
        if (!instance.linkedSelection && linkedConfig.groups.length > 0) {
          issues.push({ code: "MISSING_LINKED_SELECTION", path: instancePath, message: "Linked product configuration is required." });
        } else if (instance.linkedSelection) {
          validateProductSelection(linkedConfig, instance.linkedSelection, `${instancePath}.linkedSelection`, [...productStack, linkedConfig.productId]);
        }
      }
    });

    for (const option of group.options) {
      const count = counts.get(option.id) ?? 0;
      const min = option.minQuantity ?? 0;
      if (count < min) {
        issues.push({ code: "OPTION_MIN_NOT_MET", path: `${path}.${option.id}`, message: `Option requires at least ${min} selected units.` });
      }
      if (count > Math.min(option.maxQuantity ?? limits.maxQuantityPerGroup, effectiveMax)) {
        issues.push({ code: "OPTION_MAX_EXCEEDED", path: `${path}.${option.id}`, message: `Option allows at most ${option.maxQuantity} selected units.` });
      }
    }
  }

  validateProductSelection(configuration, selection, "$selection", [configuration.productId]);
  return issues;
}
