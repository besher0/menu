import {
  calculatePrice,
  createSelectionKey,
  DEFAULT_ENGINE_LIMITS,
  type ConfigurationIssue,
  type GroupSelection,
  type ProductConfigurationContext,
  type ProductSelectionV1
} from "@menu/shared";
import {
  resolvePublicProductConfiguration,
  type PublicConfigurationProductRecord
} from "./public-product-configuration";

export type PublicProductQuoteRequest = { selection: ProductSelectionV1 };

export type PublicQuoteError = {
  status: 400 | 409;
  code: string;
  message: string;
  issues: ConfigurationIssue[];
  currentRevision?: number;
};

export type PublicProductQuoteResult =
  | { ok: false; error: PublicQuoteError }
  | { ok: true; quote: {
      schemaVersion: 1;
      productId: string;
      configurationRevision: number;
      selectionKey: string;
      canonicalSelection: ProductSelectionV1;
      currency: string;
      trustedTotal: string;
      baseIgnored: boolean;
      priceBreakdown: ReturnType<typeof calculatePrice>["lines"];
      linkedSourceRevisions: { sourceProductId: string; mode: "NETWORK" | "LEGACY"; configurationRevision: number }[];
      configurationOrderable: true;
      previewOnly: true;
      orderAction: "STAGE_6_REQUIRED";
      orderingEnabled: false;
      runtimeContext: { scope: "RESTAURANT"; outletDifferentialApplied: false; serviceModeApplied: false; productScheduleApplied: false };
    } };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Reject unknown fields at every level, including client-supplied prices/totals. */
export function parsePublicQuoteSelection(value: unknown): { selection?: ProductSelectionV1; issues: ConfigurationIssue[] } {
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
    if (typeof input !== "string" || !input.trim() || input.length > 256) {
      issue("INVALID_SELECTION_SHAPE", path, "Expected a nonempty identifier string.");
      return "";
    }
    return input;
  };
  function product(input: unknown, path: string, depth: number): ProductSelectionV1 | null {
    if (!record(input) || depth > DEFAULT_ENGINE_LIMITS.maxDepth * 2 || ++nodes > DEFAULT_ENGINE_LIMITS.maxSelectionInstances) {
      issue("INVALID_SELECTION_SHAPE", path, "Invalid or excessively deep product selection.");
      return null;
    }
    fields(input, ["schemaVersion", "productId", "configurationRevision", "groups"], path);
    if (input.schemaVersion !== 1) issue("UNSUPPORTED_SELECTION_VERSION", `${path}.schemaVersion`, "Selection schema version must be 1.");
    if (!Number.isSafeInteger(input.configurationRevision) || (input.configurationRevision as number) < 0) {
      issue("INVALID_SELECTION_SHAPE", `${path}.configurationRevision`, "Expected a nonnegative integer revision.");
    }
    const productId = string(input.productId, `${path}.productId`);
    const groups = array(input.groups, `${path}.groups`).map((group, index) => groupSelection(group, `${path}.groups[${index}]`, depth + 1));
    return { schemaVersion: 1, productId, configurationRevision: input.configurationRevision as number, groups: groups.filter((group): group is GroupSelection => group !== null) };
  }
  function groupSelection(input: unknown, path: string, depth: number): GroupSelection | null {
    if (!record(input) || depth > DEFAULT_ENGINE_LIMITS.maxDepth * 2 || ++nodes > DEFAULT_ENGINE_LIMITS.maxSelectionInstances) {
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
      fields(input, ["type", "groupId", "instances"], path);
      const instances = array(input.instances, `${path}.instances`).flatMap((raw, index) => {
        const instancePath = `${path}.instances[${index}]`;
        if (!record(raw) || depth > DEFAULT_ENGINE_LIMITS.maxDepth * 2 || ++nodes > DEFAULT_ENGINE_LIMITS.maxSelectionInstances) {
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
      return { type: "OPTIONS", groupId: string(input.groupId, `${path}.groupId`), instances };
    }
    issue("INVALID_SELECTION_SHAPE", `${path}.type`, "Group type must be SIZE or OPTIONS.");
    return null;
  }
  const selection = product(value, "$selection", 0);
  return { selection: issues.length ? undefined : selection ?? undefined, issues };
}

function canonicalGroups(groups: readonly GroupSelection[]): GroupSelection[] {
  return groups.map((group) => group.type === "SIZE"
    ? { ...group, children: canonicalGroups(group.children ?? []) }
    : {
      ...group,
      instances: group.instances.map((instance) => ({
        ...instance,
        children: canonicalGroups(instance.children ?? []),
        ...(instance.linkedSelection ? { linkedSelection: canonicalSelection(instance.linkedSelection) } : {})
      })).sort((a, b) => a.instanceId.localeCompare(b.instanceId))
    }).sort((a, b) => a.groupId.localeCompare(b.groupId));
}

function canonicalSelection(selection: ProductSelectionV1): ProductSelectionV1 {
  return { ...selection, groups: canonicalGroups(selection.groups) };
}

export function quotePublicProductConfiguration(args: {
  restaurantId: string;
  owner: PublicConfigurationProductRecord;
  catalogProducts: readonly PublicConfigurationProductRecord[];
  capabilityEnabled: boolean;
  currency: string;
  selection: unknown;
}): PublicProductQuoteResult {
  const parsed = parsePublicQuoteSelection(args.selection);
  if (!parsed.selection) return { ok: false, error: { status: 400, code: "INVALID_QUOTE_SELECTION", message: "Selection payload is invalid.", issues: parsed.issues } };

  const publicConfiguration = resolvePublicProductConfiguration(args);
  if (!publicConfiguration) return { ok: false, error: { status: 409, code: "CONFIGURATION_UNAVAILABLE", message: "Current Network configuration is unavailable.", issues: [] } };
  const currentRevision = publicConfiguration.configurationRevision;
  if (parsed.selection.configurationRevision !== currentRevision) {
    return { ok: false, error: {
      status: 409, code: "CONFIGURATION_REVISION_CHANGED", message: "Product configuration has changed; reload before continuing.", currentRevision,
      issues: [{ code: "STALE_CONFIGURATION_REVISION", path: "$selection.configurationRevision", message: "Selection revision does not match the current configuration." }]
    } };
  }
  if (!publicConfiguration.orderable) {
    return { ok: false, error: { status: 409, code: "CONFIGURATION_NOT_ORDERABLE", message: "Current configuration cannot be quoted.", currentRevision, issues: publicConfiguration.issues } };
  }

  const linkedProducts = new Map(publicConfiguration.linkedProducts.map((source) => [source.productId, {
    productId: source.productId,
    catalogId: args.restaurantId,
    configuration: source.configuration,
    available: source.available,
    orderable: source.orderable
  }]));
  const context: ProductConfigurationContext = { catalogId: args.restaurantId, linkedProducts };
  const selection = canonicalSelection(parsed.selection);
  const price = calculatePrice(publicConfiguration.configuration, selection, context);
  if (!price.valid || price.total === null) {
    const stale = price.issues.some((issue) => issue.code === "STALE_CONFIGURATION_REVISION");
    const changed = price.issues.some((issue) => [
      "LINK_TARGET_NOT_FOUND", "LINKED_PRODUCT_UNAVAILABLE", "SIZE_UNAVAILABLE",
      "OPTION_UNAVAILABLE", "OPTIONS_GROUP_UNAVAILABLE", "REQUIRED_SIZE_GROUP_UNAVAILABLE",
      "REQUIRED_OPTIONS_GROUP_UNAVAILABLE"
    ].includes(issue.code));
    return { ok: false, error: {
      status: stale || changed ? 409 : 400,
      code: stale ? "LINKED_CONFIGURATION_REVISION_CHANGED" : changed ? "CONFIGURATION_CHANGED" : "INVALID_QUOTE_SELECTION",
      message: stale || changed ? "Configuration availability or revision has changed; reload before continuing." : "Selection does not satisfy the current configuration.",
      currentRevision,
      issues: price.issues
    } };
  }
  return { ok: true, quote: {
    schemaVersion: 1,
    productId: args.owner.id,
    configurationRevision: currentRevision,
    selectionKey: createSelectionKey(selection),
    canonicalSelection: selection,
    currency: args.currency,
    trustedTotal: price.total,
    baseIgnored: price.baseIgnored,
    priceBreakdown: price.lines,
    linkedSourceRevisions: publicConfiguration.linkedProducts.map((source) => ({
      sourceProductId: source.productId,
      mode: source.mode,
      configurationRevision: source.configuration.revision
    })),
    configurationOrderable: true,
    previewOnly: true,
    orderAction: "STAGE_6_REQUIRED",
    orderingEnabled: false,
    runtimeContext: publicConfiguration.runtimeContext
  } };
}
