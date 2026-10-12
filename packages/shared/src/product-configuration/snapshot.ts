import { calculatePrice } from "./pricing";
import {
  ConfigurationSnapshot,
  GroupSelection,
  ProductConfigurationContext,
  ProductConfigurationV1,
  ProductSelectionV1,
  PRODUCT_CONFIGURATION_SNAPSHOT_VERSION,
  SnapshotResult
} from "./types";

function canonicalGroups(groups: readonly GroupSelection[]): unknown[] {
  return [...groups]
    .sort((left, right) => (left.groupId < right.groupId ? -1 : left.groupId > right.groupId ? 1 : 0))
    .map((group) => {
      if (group.type === "SIZE") {
        return {
          type: group.type,
          groupId: group.groupId,
          sizeChoiceId: group.sizeChoiceId,
          children: canonicalGroups(group.children ?? [])
        };
      }
      const instances = group.instances.map((instance) => ({
        optionId: instance.optionId,
        children: canonicalGroups(instance.children ?? []),
        linkedSelection: instance.linkedSelection
          ? {
              productId: instance.linkedSelection.productId,
              configurationRevision: instance.linkedSelection.configurationRevision,
              groups: canonicalGroups(instance.linkedSelection.groups)
            }
          : null
      }));
      instances.sort((left, right) => {
        const a = JSON.stringify(left);
        const b = JSON.stringify(right);
        return a < b ? -1 : a > b ? 1 : 0;
      });
      return { type: group.type, groupId: group.groupId, instances };
    });
}

/** Stable semantic key: instance IDs and array ordering do not change configuration identity. */
export function createSelectionKey(selection: ProductSelectionV1): string {
  return JSON.stringify({
    schemaVersion: selection.schemaVersion,
    productId: selection.productId,
    configurationRevision: selection.configurationRevision,
    groups: canonicalGroups(selection.groups)
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}

export function createConfigurationSnapshot(args: {
  configuration: ProductConfigurationV1;
  selection: ProductSelectionV1;
  context: ProductConfigurationContext;
  productName: string;
  currency: string;
  createdAt: string;
}): SnapshotResult {
  const metadataIssues = [];
  if (!args.productName.trim()) {
    metadataIssues.push({ code: "MISSING_PRODUCT_NAME", path: "$snapshot.productName", message: "Snapshot product name is required." });
  }
  if (!args.currency.trim()) {
    metadataIssues.push({ code: "MISSING_CURRENCY", path: "$snapshot.currency", message: "Snapshot currency is required." });
  }
  if (!args.createdAt.trim() || !Number.isFinite(Date.parse(args.createdAt))) {
    metadataIssues.push({ code: "INVALID_SNAPSHOT_TIME", path: "$snapshot.createdAt", message: "Snapshot time must be a valid date-time string." });
  }

  const price = calculatePrice(args.configuration, args.selection, args.context);
  const issues = [...metadataIssues, ...price.issues];
  if (!price.valid || price.total === null || issues.length) return { valid: false, snapshot: null, issues };

  const snapshot: ConfigurationSnapshot = {
    snapshotVersion: PRODUCT_CONFIGURATION_SNAPSHOT_VERSION,
    productId: args.configuration.productId,
    productName: args.productName,
    currency: args.currency,
    configurationRevision: args.configuration.revision,
    selectionKey: createSelectionKey(args.selection),
    selection: cloneJson(args.selection),
    total: price.total,
    baseIgnored: price.baseIgnored,
    priceLines: cloneJson(price.lines),
    createdAt: args.createdAt
  };
  return { valid: true, snapshot: deepFreeze(snapshot), issues: [] };
}
