import { DEFAULT_ENGINE_LIMITS, type ProductSelectionV2, type GroupSelection, type ConfigurationIssue } from "./v2-types";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Reject unknown fields at every level, including client-supplied prices/totals. */
export function parseProductSelectionV2(value: unknown): { selection?: ProductSelectionV2; issues: ConfigurationIssue[] } {
  const issues: ConfigurationIssue[] = [];
  let nodes = 0;
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const fields = (input: Record<string, unknown>, allowed: readonly string[], path: string) => {
    for (const key of Object.keys(input)) {
      if (!allowed.includes(key)) issue("UNEXPECTED_SELECTION_FIELD", `${path}.${key}`, "Client-provided pricing or unknown selection fields are not accepted.");
    }
  };
  const array = (input: unknown, path: string): unknown[] => {
    if (!Array.isArray(input)) {
      issue("INVALID_SELECTION_SHAPE", path, "Expected an array.");
      return [];
    }
    if (input.length > DEFAULT_ENGINE_LIMITS.maxSelectionInstances) {
      issue("SELECTION_INSTANCE_LIMIT_EXCEEDED", path, "Selection safety limit exceeded.");
      return [];
    }
    return input;
  };
  const string = (input: unknown, path: string) => {
    if (typeof input !== "string" || !input.trim() || input.length > 512) {
      issue("INVALID_SELECTION_SHAPE", path, "Expected a nonempty identifier string.");
      return "";
    }
    return input;
  };
  function product(input: unknown, path: string, depth: number): ProductSelectionV2 | null {
    if (!record(input) || depth > DEFAULT_ENGINE_LIMITS.maxDepth * 2 || ++nodes > DEFAULT_ENGINE_LIMITS.maxNodes) {
      issue("INVALID_SELECTION_SHAPE", path, "Invalid or excessively deep product selection.");
      return null;
    }
    fields(input, ["schemaVersion", "productId", "configurationRevision", "groups"], path);
    if (input.schemaVersion !== 2) issue("UNSUPPORTED_SELECTION_VERSION", `${path}.schemaVersion`, "Selection schema version must be 2.");
    if (!Number.isSafeInteger(input.configurationRevision) || (input.configurationRevision as number) < 0) {
      issue("INVALID_SELECTION_SHAPE", `${path}.configurationRevision`, "Expected a nonnegative integer revision.");
    }
    const productId = string(input.productId, `${path}.productId`);
    const groups = array(input.groups, `${path}.groups`).map((group, index) => groupSelection(group, `${path}.groups[${index}]`, depth + 1));
    return { schemaVersion: 2, productId, configurationRevision: input.configurationRevision as number, groups: groups.filter((group): group is GroupSelection => group !== null) };
  }
  function groupSelection(input: unknown, path: string, depth: number): GroupSelection | null {
    if (!record(input) || depth > DEFAULT_ENGINE_LIMITS.maxDepth * 2 || ++nodes > DEFAULT_ENGINE_LIMITS.maxNodes) {
      issue("INVALID_SELECTION_SHAPE", path, "Invalid or excessively deep group selection.");
      return null;
    }
    if (input.type === "SIZE") {
      fields(input, ["type", "groupId", "sizeChoiceId", "children"], path);
      return {
        type: "SIZE",
        groupId: string(input.groupId, `${path}.groupId`),
        sizeChoiceId: string(input.sizeChoiceId, `${path}.sizeChoiceId`),
        children: input.children === undefined ? [] : array(input.children, `${path}.children`).map((child, index) => groupSelection(child, `${path}.children[${index}]`, depth + 1)).filter((child): child is GroupSelection => child !== null)
      };
    }
    if (input.type === "OPTIONS") {
      fields(input, ["type", "groupId", "instances", "children"], path);
      const instances = array(input.instances, `${path}.instances`).flatMap((raw, index) => {
        const instancePath = `${path}.instances[${index}]`;
        if (!record(raw) || depth > DEFAULT_ENGINE_LIMITS.maxDepth * 2 || ++nodes > DEFAULT_ENGINE_LIMITS.maxNodes) {
          issue("INVALID_SELECTION_SHAPE", instancePath, "Invalid or excessively deep option instance.");
          return [];
        }
        fields(raw, ["instanceId", "optionId", "children", "linkedSelection"], instancePath);
        const linkedSelection = raw.linkedSelection === undefined ? undefined : product(raw.linkedSelection, `${instancePath}.linkedSelection`, depth + 1);
        return [{
          instanceId: string(raw.instanceId, `${instancePath}.instanceId`),
          optionId: string(raw.optionId, `${instancePath}.optionId`),
          children: raw.children === undefined ? [] : array(raw.children, `${instancePath}.children`).map((child, childIndex) => groupSelection(child, `${instancePath}.children[${childIndex}]`, depth + 1)).filter((child): child is GroupSelection => child !== null),
          ...(linkedSelection ? { linkedSelection } : {})
        }];
      });
      return { type: "OPTIONS", groupId: string(input.groupId, `${path}.groupId`), instances, children: input.children === undefined ? [] : array(input.children, `${path}.children`).map((child, i) => groupSelection(child, `${path}.children[${i}]`, depth + 1)).filter((child): child is GroupSelection => child !== null) };
    }
    issue("INVALID_SELECTION_SHAPE", `${path}.type`, "Group type must be SIZE or OPTIONS.");
    return null;
  }
  const selection = product(value, "$selection", 0);
  return { selection: issues.length ? undefined : selection ?? undefined, issues };
}
