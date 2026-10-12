import {
  ConfigurationGroup,
  ConfigurationIssue,
  DEFAULT_ENGINE_LIMITS,
  EngineLimits,
  OptionGroup,
  ProductConfigurationV1,
  PRODUCT_CONFIGURATION_SCHEMA_VERSION
} from "./types";
import { validateMoneyString } from "./money";

export function resolveEngineLimits(overrides?: Partial<EngineLimits>): EngineLimits {
  return { ...DEFAULT_ENGINE_LIMITS, ...overrides };
}

function isBoundedInteger(value: unknown, min: number, max: number) {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function requiredText(value: unknown, path: string, issues: ConfigurationIssue[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push({ code: "REQUIRED_TEXT", path, message: "A non-empty string is required." });
  }
}

function collectSizeChoiceIds(groups: readonly ConfigurationGroup[], result = new Set<string>()) {
  for (const group of groups) {
    if (group.type === "SIZE") {
      for (const size of group.sizes) {
        result.add(size.id);
        collectSizeChoiceIds(size.children ?? [], result);
      }
    } else {
      for (const option of group.options) collectSizeChoiceIds(option.children ?? [], result);
    }
  }
  return result;
}

export function configurationContainsSize(groups: readonly ConfigurationGroup[]): boolean {
  for (const group of groups) {
    if (group.type === "SIZE") return true;
    for (const option of group.options) {
      if (configurationContainsSize(option.children ?? [])) return true;
      if (option.linkedProduct?.mode === "CUSTOM" && option.linkedProduct.customConfiguration) {
        if (configurationContainsSize(option.linkedProduct.customConfiguration.groups)) return true;
      }
    }
  }
  return false;
}

export function validateConfiguration(
  configuration: ProductConfigurationV1,
  limitOverrides?: Partial<EngineLimits>
): ConfigurationIssue[] {
  const limits = resolveEngineLimits(limitOverrides);
  const issues: ConfigurationIssue[] = [];
  const seenConfigurations = new Set<ProductConfigurationV1>();
  let nodeCount = 0;

  function validateOne(config: ProductConfigurationV1, path: string) {
    if (seenConfigurations.has(config)) {
      issues.push({ code: "INLINE_CONFIGURATION_CYCLE", path, message: "Custom configuration objects cannot contain reference cycles." });
      return;
    }
    seenConfigurations.add(config);

    if (config.schemaVersion !== PRODUCT_CONFIGURATION_SCHEMA_VERSION) {
      issues.push({ code: "UNSUPPORTED_CONFIGURATION_VERSION", path: `${path}.schemaVersion`, message: "Unsupported configuration schema version." });
    }
    requiredText(config.productId, `${path}.productId`, issues);
    if (!isBoundedInteger(config.revision, 0, Number.MAX_SAFE_INTEGER)) {
      issues.push({ code: "INVALID_REVISION", path: `${path}.revision`, message: "Revision must be a non-negative safe integer." });
    }
    if (config.basePrice !== null) {
      issues.push(...validateMoneyString(config.basePrice, `${path}.basePrice`, limits));
    }
    if (!Array.isArray(config.groups)) {
      issues.push({ code: "INVALID_GROUPS", path: `${path}.groups`, message: "Groups must be an array." });
      seenConfigurations.delete(config);
      return;
    }

    const sizeChoiceIds = collectSizeChoiceIds(config.groups);
    const ids = new Set<string>();

    function registerId(id: unknown, idPath: string) {
      requiredText(id, idPath, issues);
      if (typeof id !== "string" || !id.trim()) return;
      if (ids.has(id)) {
        issues.push({ code: "DUPLICATE_NODE_ID", path: idPath, message: `Node ID '${id}' is duplicated in one configuration.` });
      }
      ids.add(id);
      nodeCount += 1;
      if (nodeCount > limits.maxNodes) {
        issues.push({ code: "NODE_LIMIT_EXCEEDED", path: idPath, message: "Configuration node limit exceeded." });
      }
    }

    function validateGroups(groups: readonly ConfigurationGroup[], groupPath: string, depth: number, sizeSeen: boolean) {
      if (depth > limits.maxDepth) {
        issues.push({ code: "DEPTH_LIMIT_EXCEEDED", path: groupPath, message: "Configuration depth limit exceeded." });
        return;
      }

      groups.forEach((group, groupIndex) => {
        const currentPath = `${groupPath}[${groupIndex}]`;
        registerId(group.id, `${currentPath}.id`);
        requiredText(group.label, `${currentPath}.label`, issues);

        if (group.type === "SIZE") {
          if (sizeSeen) {
            issues.push({ code: "SIZE_AFTER_SIZE", path: currentPath, message: "A path cannot enter another Size group after a Size group." });
          }
          if (!Array.isArray(group.sizes) || group.sizes.length === 0) {
            issues.push({ code: "EMPTY_SIZE_GROUP", path: `${currentPath}.sizes`, message: "A Size group requires at least one size." });
            return;
          }
          if (group.sizes.length > limits.maxGroupChoices) {
            issues.push({ code: "GROUP_CHOICE_LIMIT_EXCEEDED", path: `${currentPath}.sizes`, message: "Size choice limit exceeded." });
          }
          group.sizes.forEach((size, sizeIndex) => {
            const sizePath = `${currentPath}.sizes[${sizeIndex}]`;
            registerId(size.id, `${sizePath}.id`);
            requiredText(size.label, `${sizePath}.label`, issues);
            issues.push(...validateMoneyString(size.price, `${sizePath}.price`, limits));
            validateGroups(size.children ?? [], `${sizePath}.children`, depth + 1, true);
          });
          return;
        }

        validateOptionGroup(group, currentPath, depth, sizeSeen);
      });
    }

    function validateOptionGroup(group: OptionGroup, currentPath: string, depth: number, sizeSeen: boolean) {
      const merchantMax = group.max ?? limits.maxQuantityPerGroup;
      if (!isBoundedInteger(group.min, 0, limits.maxQuantityPerGroup)) {
        issues.push({ code: "INVALID_GROUP_MIN", path: `${currentPath}.min`, message: "Group min must be a bounded non-negative integer." });
      }
      if (group.max !== null && !isBoundedInteger(group.max, 0, limits.maxQuantityPerGroup)) {
        issues.push({ code: "INVALID_GROUP_MAX", path: `${currentPath}.max`, message: "Group max must be null or a bounded non-negative integer." });
      }
      if (Number.isSafeInteger(group.min) && Number.isSafeInteger(merchantMax) && group.min > merchantMax) {
        issues.push({ code: "GROUP_MIN_EXCEEDS_MAX", path: currentPath, message: "Group min cannot exceed its effective max." });
      }
      if (!isBoundedInteger(group.includedQuantity, 0, limits.maxQuantityPerGroup)) {
        issues.push({ code: "INVALID_INCLUDED_QUANTITY", path: `${currentPath}.includedQuantity`, message: "Included quantity must be a bounded non-negative integer." });
      } else if (group.includedQuantity > merchantMax) {
        issues.push({ code: "INCLUDED_EXCEEDS_GROUP_MAX", path: `${currentPath}.includedQuantity`, message: "Included quantity cannot exceed the group's effective max." });
      }
      if (!Array.isArray(group.options) || group.options.length === 0) {
        issues.push({ code: "EMPTY_OPTIONS_GROUP", path: `${currentPath}.options`, message: "An Options group requires at least one option." });
        return;
      }
      if (group.options.length > limits.maxGroupChoices) {
        issues.push({ code: "GROUP_CHOICE_LIMIT_EXCEEDED", path: `${currentPath}.options`, message: "Option choice limit exceeded." });
      }

      group.options.forEach((option, optionIndex) => {
        const optionPath = `${currentPath}.options[${optionIndex}]`;
        registerId(option.id, `${optionPath}.id`);
        requiredText(option.label, `${optionPath}.label`, issues);
        issues.push(...validateMoneyString(option.price, `${optionPath}.price`, limits));
        const minQuantity = option.minQuantity ?? 0;
        if (!isBoundedInteger(minQuantity, 0, limits.maxQuantityPerGroup)) {
          issues.push({ code: "INVALID_OPTION_MIN", path: `${optionPath}.minQuantity`, message: "Option min must be a bounded non-negative integer." });
        }
        if (!isBoundedInteger(option.maxQuantity, 0, limits.maxQuantityPerGroup)) {
          issues.push({ code: "INVALID_OPTION_MAX", path: `${optionPath}.maxQuantity`, message: "Option max must be a bounded non-negative integer." });
        }
        if (Number.isSafeInteger(minQuantity) && Number.isSafeInteger(option.maxQuantity) && minQuantity > option.maxQuantity) {
          issues.push({ code: "OPTION_MIN_EXCEEDS_MAX", path: optionPath, message: "Option min cannot exceed option max." });
        }
        if (group.max !== null && Number.isSafeInteger(option.maxQuantity) && option.maxQuantity > group.max) {
          issues.push({ code: "OPTION_MAX_EXCEEDS_GROUP_MAX", path: `${optionPath}.maxQuantity`, message: "Option max cannot exceed a numeric parent group max." });
        }

        const overrideIds = new Set<string>();
        for (const [overrideIndex, override] of (option.priceOverrides ?? []).entries()) {
          const overridePath = `${optionPath}.priceOverrides[${overrideIndex}]`;
          requiredText(override.sizeChoiceId, `${overridePath}.sizeChoiceId`, issues);
          if (overrideIds.has(override.sizeChoiceId)) {
            issues.push({ code: "DUPLICATE_SIZE_PRICE_OVERRIDE", path: overridePath, message: "A size price override is duplicated." });
          }
          overrideIds.add(override.sizeChoiceId);
          if (!sizeChoiceIds.has(override.sizeChoiceId)) {
            issues.push({ code: "UNKNOWN_SIZE_PRICE_OVERRIDE", path: overridePath, message: "Size price override references an unknown size choice." });
          }
          if (override.price !== null) {
            issues.push(...validateMoneyString(override.price, `${overridePath}.price`, limits));
          }
        }

        if (option.linkedProduct) {
          const linkedPath = `${optionPath}.linkedProduct`;
          requiredText(option.linkedProduct.sourceProductId, `${linkedPath}.sourceProductId`, issues);
          if (option.linkedProduct.sourceProductId === config.productId) {
            issues.push({ code: "SELF_LINK", path: linkedPath, message: "A product cannot link to itself." });
          }
          if (option.linkedProduct.mode === "CUSTOM") {
            if (!option.linkedProduct.customConfiguration) {
              issues.push({ code: "MISSING_CUSTOM_CONFIGURATION", path: linkedPath, message: "CUSTOM mode requires a configuration snapshot." });
            } else {
              if (option.linkedProduct.customConfiguration.productId !== option.linkedProduct.sourceProductId) {
                issues.push({ code: "CUSTOM_SOURCE_ID_MISMATCH", path: linkedPath, message: "Custom snapshot product ID must match the linked source product ID." });
              }
              validateOne(option.linkedProduct.customConfiguration, `${linkedPath}.customConfiguration`);
            }
          } else if (option.linkedProduct.customConfiguration) {
            issues.push({ code: "ORIGINAL_HAS_CUSTOM_CONFIGURATION", path: linkedPath, message: "ORIGINAL mode must resolve the live source structure, not an embedded custom snapshot." });
          }
          for (const [nodeId, price] of Object.entries(option.linkedProduct.originalPriceOverrides ?? {})) {
            issues.push(...validateMoneyString(price, `${linkedPath}.originalPriceOverrides.${nodeId}`, limits));
          }
        }

        validateGroups(option.children ?? [], `${optionPath}.children`, depth + 1, sizeSeen);
      });

      const optionMinimumTotal = group.options.reduce((total, option) => total + (option.minQuantity ?? 0), 0);
      if (optionMinimumTotal > merchantMax) {
        issues.push({
          code: "OPTION_MINIMA_EXCEED_GROUP_MAX",
          path: currentPath,
          message: "The sum of option minima cannot exceed the group's effective max."
        });
      }
    }

    validateGroups(config.groups, `${path}.groups`, 1, false);
    seenConfigurations.delete(config);
  }

  validateOne(configuration, "$configuration");
  return issues;
}
