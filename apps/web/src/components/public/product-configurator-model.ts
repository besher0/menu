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
