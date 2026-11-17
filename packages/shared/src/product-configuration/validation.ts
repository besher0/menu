import { ConfigurationGroup, ConfigurationIssue, DEFAULT_ENGINE_LIMITS, EngineLimits, MAX_GROUP_LEVELS, OptionChoice, ProductConfigurationV2, SizeGroup } from "./v2-types";
import { validateMoneyString } from "./money";
import { resolveSizePricingScope } from "./scope";
export function resolveEngineLimits(overrides?: Partial<EngineLimits>): EngineLimits {
  const limits = { ...DEFAULT_ENGINE_LIMITS };
  for (const key of Object.keys(limits) as (keyof EngineLimits)[]) {
    const value = overrides?.[key];
    if (value !== undefined) {
      const minimum = key === "maxMoneyScale" ? 0 : 1;
      if (!Number.isSafeInteger(value) || value < minimum || value > limits[key])
        throw new Error("Invalid or relaxed engine safety limit");
      limits[key] = value;
    }
  }
  return limits;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function configurationContainsSize(groups: readonly ConfigurationGroup[]): boolean {
  return groups.some(group => group.type === "SIZE" || configurationContainsSize(group.children ?? []) ||
    group.options.some(option => configurationContainsSize(option.children ?? []) ||
      (option.linkedProduct?.mode === "CUSTOM" && option.linkedProduct.customConfiguration
        ? configurationContainsSize(option.linkedProduct.customConfiguration.groups) : false)));
}
/** Counts the resolved path across product boundaries, stopping on cycles and bounds. */
export function validateGroupLevels(configuration: ProductConfigurationV2, resolveOriginal?: (id: string) => ProductConfigurationV2 | undefined, parentLevel = 0): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  let visited = 0;
  function visit(groups: readonly ConfigurationGroup[], level: number, sizeSeen: boolean, stack: string[], path: string) {
    if (!Array.isArray(groups) || !groups.length || issues.length)
      return;
    if (level > MAX_GROUP_LEVELS) {
      issues.push({ code: "GROUP_LEVEL_LIMIT", path, message: "At most three group levels are supported." });
      return;
    }
    for (const group of groups) {
      if (!group || ++visited > DEFAULT_ENGINE_LIMITS.maxNodes) {
        issues.push({ code: "NODE_LIMIT_EXCEEDED", path, message: "Resolved group safety limit exceeded." });
        return;
      }
      if (sizeSeen && group.type === "SIZE") {
        issues.push({ code: "SIZE_AFTER_SIZE", path, message: "Size groups cannot nest on one resolved path." });
        return;
      }
      const nextSize = sizeSeen || group.type === "SIZE";
      visit(group.children ?? [], level + 1, nextSize, stack, path + "." + group.id + ".children");
      if (group.type !== "OPTIONS" || !Array.isArray(group.options))
        continue;
      for (const option of group.options) {
        if (!option)
          continue;
        visit(option.children ?? [], level + 1, nextSize, stack, path + "." + option.id);
        const link = option.linkedProduct;
        if (!link)
          continue;
        if (stack.includes(link.sourceProductId)) {
          issues.push({ code: "LINK_CYCLE", path, message: "Linked products form a cycle." });
          return;
        }
        const source = link.mode === "CUSTOM" ? link.customConfiguration : resolveOriginal?.(link.sourceProductId);
        if (source)
          visit(source.groups, level + 1, nextSize, [...stack, link.sourceProductId], path + ".linked");
      }
    }
  }
  visit(configuration?.groups, parentLevel + 1, false, [configuration?.productId], "$configuration.groups");
  return issues;
}
/** Checks untrusted JSON before pricing or selection traversal. */
export function validateConfiguration(configuration: ProductConfigurationV2, overrides?: Partial<EngineLimits>): ConfigurationIssue[] {
  const limits = resolveEngineLimits(overrides), issues: ConfigurationIssue[] = [];
  let nodes = 0;
  const objects = new Set<object>();
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message });
  function text(value: unknown, path: string) {
    if (typeof value !== "string" || !value.trim() || value.length > 512)
      issue("REQUIRED_TEXT", path, "Expected non-empty bounded text.");
  }
  function integer(value: unknown, path: string, code: string, nullable = false) {
    if (nullable && value === null)
      return;
    if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > limits.maxQuantityPerGroup)
      issue(code, path, "Expected bounded quantity.");
  }
  function money(value: unknown, path: string) { issues.push(...validateMoneyString(value, path, limits)); }
  function enter(value: unknown, path: string): value is Record<string, unknown> {
    if (!isRecord(value)) {
      issue("INVALID_NODE", path, "Expected an object.");
      return false;
    }
    if (++nodes > limits.maxNodes) {
      issue("NODE_LIMIT_EXCEEDED", path, "Node limit exceeded.");
      return false;
    }
    if (objects.has(value)) {
      issue("INLINE_CONFIGURATION_CYCLE", path, "Inline cycle detected.");
      return false;
    }
    objects.add(value);
    return true;
  }
  function flag(value: unknown, path: string) {
    if (value !== undefined && typeof value !== "boolean")
      issue("INVALID_BOOLEAN", path, "Expected boolean.");
  }
  function one(config: unknown, path: string, level: number, sizeSeen: boolean) {
    if (!enter(config, path))
      return;
    if (config.schemaVersion !== 2)
      issue("UNSUPPORTED_CONFIGURATION_VERSION", path + ".schemaVersion", "Configuration V2 is required.");
    text(config.productId, path + ".productId");
    const productId = config.productId;
    if (!Number.isSafeInteger(config.revision) || Number(config.revision) < 0)
      issue("INVALID_REVISION", path, "Invalid revision.");
    if (config.basePrice !== null)
      money(config.basePrice, path + ".basePrice");
    const ids = new Set<string>();
    function id(value: unknown, at: string) {
      text(value, at);
      if (typeof value === "string") {
        if (ids.has(value))
          issue("DUPLICATE_NODE_ID", at, "IDs must be unique within a configuration.");
        ids.add(value);
      }
    }
    function pricing(option: Record<string, unknown>, siblings: ConfigurationGroup[], ancestor: SizeGroup | undefined, at: string) {
      money(option.price, at + ".price");
      if ("priceOverrides" in option)
        issue("UNSUPPORTED_V1_FIELD", at, "Use priceBySize.");
      if (option.priceBySize === undefined)
        return;
      if (!isRecord(option.priceBySize) || !isRecord(option.priceBySize.overrides)) {
        issue("INVALID_SIZE_PRICING", at, "Expected a size group ID and override map.");
        return;
      }
      const scope = resolveSizePricingScope(option as unknown as OptionChoice, siblings, ancestor);
      if (!scope || !Array.isArray(scope.sizes)) {
        issue("INVALID_SIZE_PRICING_SCOPE", at, "Size target is outside the eligible structural scope.");
        return;
      }
      const known = new Set(scope.sizes.filter(isRecord).map(size => size.id));
      const entries = Object.entries(option.priceBySize.overrides);
      if (entries.length > limits.maxGroupChoices)
        issue("GROUP_CHOICE_LIMIT_EXCEEDED", at, "Too many overrides.");
      for (const [key, value] of entries.slice(0, limits.maxGroupChoices + 1)) {
        if (!known.has(key))
          issue("UNKNOWN_SIZE_PRICE_OVERRIDE", at + "." + key, "Override is outside the target size group.");
        if (value !== null)
          money(value, at + "." + key);
      }
    }
    function groups(input: unknown, at: string, depth: number, seenSize: boolean, ancestor?: SizeGroup) {
      if (!Array.isArray(input)) {
        issue("INVALID_GROUPS", at, "Groups must be an array.");
        return;
      }
      if (!input.length)
        return;
      if (depth > MAX_GROUP_LEVELS || depth > limits.maxDepth) {
        issue("GROUP_LEVEL_LIMIT", at, "At most three group levels.");
        return;
      }
      if (input.length > limits.maxNodes) {
        issue("NODE_LIMIT_EXCEEDED", at, "Too many groups.");
        return;
      }
      const siblings = input.filter(isRecord) as unknown as ConfigurationGroup[];
      input.forEach((value, index) => {
        const groupPath = at + "[" + index + "]";
        if (nodes > limits.maxNodes || !enter(value, groupPath))
          return;
        const group = value;
        id(group.id, groupPath + ".id");
        text(group.label, groupPath + ".label");
        flag(group.available, groupPath);
        flag(group.hidePublicLabel, groupPath);
        flag(group.highlightInPriceSummary, groupPath);
        if (group.hidePublicLabel && group.highlightInPriceSummary)
          issue("INVALID_SUMMARY_HIGHLIGHT", groupPath, "Hidden headings cannot have a star.");
        if (group.type !== "SIZE" && group.type !== "OPTIONS") {
          issue("INVALID_GROUP_TYPE", groupPath, "Expected SIZE or OPTIONS.");
          objects.delete(group);
          return;
        }
        const size = group.type === "SIZE";
        if (size && seenSize)
          issue("SIZE_AFTER_SIZE", groupPath, "Size cannot nest beneath Size.");
        const choices = size ? group.sizes : group.options;
        if (!Array.isArray(choices) || !choices.length) {
          issue(size ? "EMPTY_SIZE_GROUP" : "EMPTY_OPTIONS_GROUP", groupPath, "Saved groups need choices.");
          objects.delete(group);
          return;
        }
        if (choices.length > limits.maxGroupChoices) {
          issue("GROUP_CHOICE_LIMIT_EXCEEDED", groupPath, "Too many choices.");
          objects.delete(group);
          return;
        }
        if (!size) {
          integer(group.min, groupPath + ".min", "INVALID_GROUP_MIN");
          integer(group.max, groupPath + ".max", "INVALID_GROUP_MAX", true);
          integer(group.includedQuantity, groupPath + ".includedQuantity", "INVALID_INCLUDED_QUANTITY");
          const max = group.max === null ? limits.maxQuantityPerGroup : Number(group.max);
          if (Number(group.min) > max)
            issue("GROUP_MIN_EXCEEDS_MAX", groupPath, "Min exceeds max.");
          if (Number(group.includedQuantity) > max)
            issue("INCLUDED_EXCEEDS_GROUP_MAX", groupPath, "Included exceeds max.");
        }
        let minima = 0, capacity = 0;
        choices.forEach((value, index) => {
          const choicePath = groupPath + ".choices[" + index + "]";
          if (!enter(value, choicePath))
            return;
          const choice = value;
          id(choice.id, choicePath + ".id");
          text(choice.label, choicePath + ".label");
          flag(choice.available, choicePath);
          if (size) {
            money(choice.price, choicePath + ".price");
            if ("children" in choice)
              issue("SIZE_CHOICE_HAS_CHILDREN", choicePath, "Use Group.children.");
            if ("calories" in choice)
              issue("UNSUPPORTED_FIELD", choicePath, "Calories are deferred.");
          }
          else {
            pricing(choice, siblings, ancestor, choicePath);
            flag(choice.highlightInPriceSummary, choicePath);
            integer(choice.minQuantity ?? 0, choicePath + ".minQuantity", "INVALID_OPTION_MIN");
            integer(choice.maxQuantity, choicePath + ".maxQuantity", "INVALID_OPTION_MAX", true);
            const min = Number(choice.minQuantity ?? 0), max = choice.maxQuantity === null ? limits.maxQuantityPerGroup : Number(choice.maxQuantity);
            if (min > max)
              issue("OPTION_MIN_EXCEEDS_MAX", choicePath, "Option min exceeds max.");
            if (group.max !== null && choice.maxQuantity !== null && Number(choice.maxQuantity) > Number(group.max))
              issue("OPTION_MAX_EXCEEDS_GROUP_MAX", choicePath, "Explicit item max exceeds group max.");
            minima += min;
            capacity += choice.available === false ? 0 : max;
            groups(choice.children ?? [], choicePath + ".children", depth + 1, seenSize, ancestor);
            if (choice.linkedProduct !== undefined) {
              const link = choice.linkedProduct;
              if (!isRecord(link))
                issue("INVALID_LINK", choicePath, "Invalid linked definition.");
              else {
                text(link.sourceProductId, choicePath);
                if (link.sourceProductId === productId)
                  issue("SELF_LINK", choicePath, "Self-link forbidden.");
                if (link.mode === "CUSTOM") {
                  if (!isRecord(link.customConfiguration))
                    issue("MISSING_CUSTOM_CONFIGURATION", choicePath, "CUSTOM snapshot required.");
                  else {
                    if (link.customConfiguration.productId !== link.sourceProductId)
                      issue("CUSTOM_SOURCE_ID_MISMATCH", choicePath, "Snapshot source mismatch.");
                    one(link.customConfiguration, choicePath + ".custom", depth + 1, seenSize);
                  }
                  if (link.originalPriceOverrides !== undefined)
                    issue("CUSTOM_HAS_ORIGINAL_PRICES", choicePath, "CUSTOM uses snapshot prices.");
                }
                else if (link.mode === "ORIGINAL") {
                  if (link.customConfiguration !== undefined)
                    issue("ORIGINAL_HAS_CUSTOM_CONFIGURATION", choicePath, "ORIGINAL uses live structure.");
                  if (link.originalPriceOverrides !== undefined) {
                    if (!isRecord(link.originalPriceOverrides))
                      issue("INVALID_ORIGINAL_PRICES", choicePath, "Expected local prices.");
                    else {
                      const entries = Object.entries(link.originalPriceOverrides);
                      if (entries.length > limits.maxNodes)
                        issue("NODE_LIMIT_EXCEEDED", choicePath, "Too many local prices.");
                      for (const [node, value] of entries.slice(0, limits.maxNodes + 1)) {
                        text(node, choicePath);
                        if (!isRecord(value))
                          issue("INVALID_LOCAL_PRICE", choicePath, "Expected local price object.");
                        else {
                          money(value.price, choicePath);
                          if (value.priceBySize !== undefined) {
                            if (!isRecord(value.priceBySize) || !isRecord(value.priceBySize.overrides))
                              issue("INVALID_SIZE_PRICING", choicePath, "Invalid local size pricing.");
                            else {
                              text(value.priceBySize.sizeGroupId, choicePath);
                              const values = Object.values(value.priceBySize.overrides);
                              if (values.length > limits.maxGroupChoices)
                                issue("GROUP_CHOICE_LIMIT_EXCEEDED", choicePath, "Too many local size prices.");
                              for (const p of values.slice(0, limits.maxGroupChoices + 1))
                                if (p !== null)
                                  money(p, choicePath);
                            }
                          }
                        }
                      }
                    }
                  }
                }
                else
                  issue("INVALID_LINK_MODE", choicePath, "Expected ORIGINAL or CUSTOM.");
              }
            }
          }
          objects.delete(choice);
        });
        if (!size) {
          const max = group.max === null ? limits.maxQuantityPerGroup : Number(group.max);
          if (minima > max)
            issue("OPTION_MINIMA_EXCEED_GROUP_MAX", groupPath, "Option minima exceed max.");
          if (Math.max(Number(group.min), minima) > Math.min(capacity, max))
            issue("UNSATISFIABLE_CONFIGURATION", groupPath, "Capacity cannot meet minima.");
          if (Number(group.includedQuantity) > Math.min(capacity, max))
            issue("INCLUDED_EXCEEDS_CAPACITY", groupPath, "Included exceeds capacity.");
        }
        groups(group.children ?? [], groupPath + ".children", depth + 1, seenSize || size, size ? group as unknown as SizeGroup : ancestor);
        objects.delete(group);
      });
    }
    groups(config.groups, path + ".groups", level, sizeSeen);
    objects.delete(config);
  }
  one(configuration, "$configuration", 1, false);
  return issues;
}
