import {
  calculatePrice,
  PRODUCT_SELECTION_SCHEMA_VERSION,
  validateSelection,
  type ConfigurationGroup,
  type GroupSelection,
  type LinkedProductCatalogEntry,
  type OptionChoice,
  type OptionGroupSelection,
  type OptionSelectionInstance,
  type SizeGroup,
  type PriceResult,
  type ProductConfigurationContext,
  type ProductConfigurationV1,
  type ProductSelectionV1,
  type SizeGroupSelection
} from "@menu/shared";
import type {
  PublicLinkedConfigurationSource,
  PublicProductConfigurationResponse
} from "@/lib/api";

export type InstanceIdFactory = (prefix: string) => string;

/** Prevents an older async quote from acting on a newer selection or route. */
export class LatestQuoteGate {
  private generation = 0;

  next() { this.generation += 1; return this.generation; }
  invalidate() { this.generation += 1; }
  isCurrent(generation: number) { return generation === this.generation; }
}

export function publicConfigurationContext(
  restaurantSlug: string,
  sources: readonly PublicLinkedConfigurationSource[]
): ProductConfigurationContext {
  const linkedProducts = new Map<string, LinkedProductCatalogEntry>();
  for (const source of sources) {
    linkedProducts.set(source.productId, {
      productId: source.productId,
      catalogId: restaurantSlug,
      configuration: source.configuration,
      available: source.available,
      orderable: source.orderable
    });
  }
  return { catalogId: restaurantSlug, linkedProducts };
}

export function linkedConfiguration(
  option: OptionChoice,
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>
) {
  const linked = option.linkedProduct;
  if (!linked) return null;
  if (linked.mode === "CUSTOM") return linked.customConfiguration ?? null;
  return sources.get(linked.sourceProductId)?.configuration ?? null;
}

/** Keep the customer's exact choice and instance IDs when only configuration revisions changed.
 * The server quote still decides whether this selection is valid and what it costs. */
export function rebaseSelectionRevisions(
  selection: ProductSelectionV1,
  configuration: ProductConfigurationV1,
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>,
  depth = 0
): ProductSelectionV1 | null {
  if (depth > 12 || selection.productId !== configuration.productId) return null;
  const groups: GroupSelection[] = [];
  for (const selected of selection.groups) {
    const group = configuration.groups.find((candidate) => candidate.id === selected.groupId && candidate.type === selected.type);
    if (!group || group.available === false) return null;
    if (selected.type === "SIZE") {
      if (group.type !== "SIZE") return null;
      const size = group.sizes.find((candidate) => candidate.id === selected.sizeChoiceId && candidate.available !== false);
      if (!size) return null;
      const children = rebaseSelectionRevisions({ ...selection, groups: selected.children ?? [] },
        { ...configuration, groups: size.children ?? [] }, sources, depth + 1);
      if (!children) return null;
      groups.push({ ...selected, children: children.groups });
      continue;
    }
    if (group.type !== "OPTIONS") return null;
    const instances: OptionSelectionInstance[] = [];
    for (const instance of selected.instances) {
      const option = group.options.find((candidate) => candidate.id === instance.optionId && candidate.available !== false);
      if (!option) return null;
      const children = rebaseSelectionRevisions({ ...selection, groups: instance.children ?? [] },
        { ...configuration, groups: option.children ?? [] }, sources, depth + 1);
      if (!children) return null;
      const linked = linkedConfiguration(option, sources);
      if (Boolean(linked) !== Boolean(instance.linkedSelection)) return null;
      const linkedSelection = linked && instance.linkedSelection
        ? rebaseSelectionRevisions(instance.linkedSelection, linked, sources, depth + 1) : undefined;
      if (linked && !linkedSelection) return null;
      instances.push({ ...instance, children: children.groups,
        ...(linkedSelection ? { linkedSelection } : {}) });
    }
    groups.push({ ...selected, instances });
  }
  return { ...selection, configurationRevision: configuration.revision, groups };
}

function buildGroups(
  groups: readonly ConfigurationGroup[],
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>,
  idFactory: InstanceIdFactory
): GroupSelection[] {
  const result: GroupSelection[] = [];
  for (const group of groups) {
    if (group.type === "SIZE") {
      const size = group.sizes.find((candidate) => candidate.available !== false);
      if (size) {
        result.push({
          type: "SIZE",
          groupId: group.id,
          sizeChoiceId: size.id,
          children: buildGroups(size.children ?? [], sources, idFactory)
        });
      }
      continue;
    }

    const instances: OptionSelectionInstance[] = [];
    for (const option of group.options) {
      const minimum = option.available === false ? 0 : option.minQuantity ?? 0;
      for (let index = 0; index < minimum; index += 1) {
        instances.push(buildOptionInstance(option, sources, idFactory));
      }
    }

    let cursor = 0;
    while (instances.length < group.min && cursor < group.options.length * 100) {
      const option = group.options[cursor % Math.max(1, group.options.length)];
      const count = option ? instances.filter((instance) => instance.optionId === option.id).length : 0;
      if (option && option.available !== false && count < option.maxQuantity) {
        instances.push(buildOptionInstance(option, sources, idFactory));
      }
      cursor += 1;
    }

    if (instances.length || group.min > 0) {
      result.push({ type: "OPTIONS", groupId: group.id, instances });
    }
  }
  return result;
}

export function buildOptionInstance(
  option: OptionChoice,
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>,
  idFactory: InstanceIdFactory
): OptionSelectionInstance {
  const linked = linkedConfiguration(option, sources);
  return {
    instanceId: idFactory("selection"),
    optionId: option.id,
    children: buildGroups(option.children ?? [], sources, idFactory),
    ...(linked ? { linkedSelection: buildInitialSelection(linked, sources, idFactory) } : {})
  };
}

export function buildInitialSelection(
  configuration: ProductConfigurationV1,
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>,
  idFactory: InstanceIdFactory
): ProductSelectionV1 {
  return {
    schemaVersion: PRODUCT_SELECTION_SCHEMA_VERSION,
    productId: configuration.productId,
    configurationRevision: configuration.revision,
    groups: buildGroups(configuration.groups, sources, idFactory)
  };
}

type SizeChangeResult = { selection: ProductSelectionV1; error?: never } | { error: string; selection?: never };

/** Preserve selected branches when size-specific groups use different node IDs. Never discard an unmatched choice. */
export function changeSizeSelection(
  selection: ProductSelectionV1,
  group: SizeGroup,
  targetSizeId: string,
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>,
  idFactory: InstanceIdFactory
): SizeChangeResult {
  const old = selection.groups.find((entry): entry is SizeGroupSelection => entry.type === "SIZE" && entry.groupId === group.id);
  const target = group.sizes.find((size) => size.id === targetSizeId);
  if (!target || target.available === false) return { error: group.label };
  if (old?.sizeChoiceId === targetSizeId) return { selection };
  const previous = group.sizes.find((size) => size.id === old?.sizeChoiceId);
  const failure = { label: "" };

  function counterpart<T extends { id: string; label: string }>(item: T, choices: readonly T[]): T | undefined {
    const byId = choices.find((choice) => choice.id === item.id);
    if (byId) return byId;
    const byLabel = choices.filter((choice) => choice.label === item.label);
    return byLabel.length === 1 ? byLabel[0] : undefined;
  }

  function merge(
    oldDefinitions: readonly ConfigurationGroup[],
    newDefinitions: readonly ConfigurationGroup[],
    oldSelections: readonly GroupSelection[],
    defaults: readonly GroupSelection[]
  ): GroupSelection[] | null {
    const merged = [...defaults];
    for (const oldSelection of oldSelections) {
      const oldDefinition = oldDefinitions.find((entry) => entry.id === oldSelection.groupId);
      if (!oldDefinition || oldDefinition.type !== oldSelection.type) { failure.label = oldSelection.groupId; return null; }
      const newDefinition = counterpart(oldDefinition, newDefinitions.filter((entry) => entry.type === oldDefinition.type));
      if (!newDefinition || newDefinition.type !== oldSelection.type || newDefinition.available === false) {
        failure.label = oldDefinition.label; return null;
      }
      let mapped: GroupSelection;
      if (oldSelection.type === "SIZE" && oldDefinition.type === "SIZE" && newDefinition.type === "SIZE") {
        const oldSize = oldDefinition.sizes.find((entry) => entry.id === oldSelection.sizeChoiceId);
        const newSize = oldSize && counterpart(oldSize, newDefinition.sizes);
        if (!oldSize || !newSize || newSize.available === false) { failure.label = oldDefinition.label; return null; }
        const childDefaults = buildGroups(newSize.children ?? [], sources, idFactory);
        const children = merge(oldSize.children ?? [], newSize.children ?? [], oldSelection.children ?? [], childDefaults);
        if (!children) return null;
        mapped = { ...oldSelection, groupId: newDefinition.id, sizeChoiceId: newSize.id, children };
      } else if (oldSelection.type === "OPTIONS" && oldDefinition.type === "OPTIONS" && newDefinition.type === "OPTIONS") {
        if (newDefinition.max !== null && oldSelection.instances.length > newDefinition.max) {
          failure.label = newDefinition.label; return null;
        }
        const counts = new Map<string, number>();
        const instances: OptionSelectionInstance[] = [];
        for (const instance of oldSelection.instances) {
          const oldOption = oldDefinition.options.find((entry) => entry.id === instance.optionId);
          const newOption = oldOption && counterpart(oldOption, newDefinition.options);
          if (!oldOption || !newOption || newOption.available === false
            || oldOption.linkedProduct?.sourceProductId !== newOption.linkedProduct?.sourceProductId
            || oldOption.linkedProduct?.mode !== newOption.linkedProduct?.mode) {
            failure.label = oldOption?.label ?? oldDefinition.label; return null;
          }
          const count = (counts.get(newOption.id) ?? 0) + 1;
          if (count > newOption.maxQuantity) { failure.label = newOption.label; return null; }
          counts.set(newOption.id, count);
          const childDefaults = buildGroups(newOption.children ?? [], sources, idFactory);
          const children = merge(oldOption.children ?? [], newOption.children ?? [], instance.children ?? [], childDefaults);
          if (!children) return null;
          instances.push({ ...instance, optionId: newOption.id, children });
        }
        mapped = { ...oldSelection, groupId: newDefinition.id, instances };
      } else { failure.label = oldDefinition.label; return null; }
      const index = merged.findIndex((entry) => entry.groupId === mapped.groupId);
      if (index >= 0) merged[index] = mapped;
      else merged.push(mapped);
    }
    return merged;
  }

  const defaults = buildGroups(target.children ?? [], sources, idFactory);
  // If the prior size was removed, match its still-selected children against the newly
  // chosen size by stable IDs. Reject incompatible branches instead of discarding them.
  const children = merge(previous?.children ?? target.children ?? [], target.children ?? [], old?.children ?? [], defaults);
  if (!children) return { error: failure.label || group.label };
  const next: SizeGroupSelection = { type: "SIZE", groupId: group.id, sizeChoiceId: targetSizeId, children };
  return { selection: replaceGroupSelection(selection, next) };
}

export function replaceGroupSelection(selection: ProductSelectionV1, group: GroupSelection | null) {
  const groupId = group?.groupId;
  if (!groupId) return selection;
  const existing = selection.groups.some((item) => item.groupId === groupId);
  return {
    ...selection,
    groups: group === null
      ? selection.groups.filter((item) => item.groupId !== groupId)
      : existing
        ? selection.groups.map((item) => item.groupId === groupId ? group : item)
        : [...selection.groups, group]
  };
}

export function updateOptionGroup(
  selection: ProductSelectionV1,
  groupId: string,
  instances: OptionSelectionInstance[]
) {
  const group: OptionGroupSelection = { type: "OPTIONS", groupId, instances };
  const existing = selection.groups.some((item) => item.groupId === groupId);
  return {
    ...selection,
    groups: instances.length === 0
      ? selection.groups.filter((item) => item.groupId !== groupId)
      : existing
        ? selection.groups.map((item) => item.groupId === groupId ? group : item)
        : [...selection.groups, group]
  };
}

export function canAddOptionInstance(input: {
  available: boolean;
  optionCount: number;
  optionMax: number;
  groupCount: number;
  groupMax: number;
  radioMode: boolean;
}) {
  return input.available
    && input.optionCount < input.optionMax
    && (input.radioMode || input.groupCount < input.groupMax);
}

export function calculatePublicPreview(
  envelope: PublicProductConfigurationResponse,
  restaurantSlug: string,
  selection: ProductSelectionV1
): PriceResult {
  const context = publicConfigurationContext(restaurantSlug, envelope.linkedProducts);
  if (!envelope.orderable) {
    return {
      valid: false,
      total: null,
      baseIgnored: false,
      lines: [],
      issues: envelope.issues.length
        ? envelope.issues
        : [{ code: "PRODUCT_UNORDERABLE", path: "$configuration", message: "Product is not currently orderable." }]
    };
  }
  return calculatePrice(envelope.configuration, selection, context);
}

export function validatePublicSelection(
  envelope: PublicProductConfigurationResponse,
  restaurantSlug: string,
  selection: ProductSelectionV1
) {
  if (!envelope.orderable) return envelope.issues;
  return validateSelection(
    envelope.configuration,
    selection,
    publicConfigurationContext(restaurantSlug, envelope.linkedProducts)
  );
}
