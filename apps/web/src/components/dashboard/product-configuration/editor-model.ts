import type {
  ConfigurationGroup,
  OptionChoice,
  ProductConfigurationV1,
  SizeChoice,
  SizeGroup
} from "@menu/shared";
import type { EditorNodeRef, ProductConfigurationDraft, ProductConfigurationEnvelope } from "./types";

export type EditableNode = ConfigurationGroup | SizeChoice | OptionChoice;

export function cloneConfiguration(configuration: ProductConfigurationV1): ProductConfigurationV1 {
  return JSON.parse(JSON.stringify(configuration)) as ProductConfigurationV1;
}

export function newNodeId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function createEmptyConfiguration(envelope: ProductConfigurationEnvelope): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId: envelope.productId,
    revision: envelope.configurationVersion + 1,
    basePrice: envelope.basePrice,
    groups: []
  };
}

export function prepareDraft(envelope: ProductConfigurationEnvelope): ProductConfigurationDraft {
  const configuration = envelope.configurationTree
    ? cloneConfiguration(envelope.configurationTree)
    : createEmptyConfiguration(envelope);
  configuration.revision = envelope.configurationVersion + 1;
  return { expectedVersion: envelope.configurationVersion, configuration, savedAt: new Date().toISOString() };
}

export function serializeDraft(draft: ProductConfigurationDraft) {
  return JSON.stringify(draft);
}

export function parseDraft(value: string | null, productId: string): ProductConfigurationDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ProductConfigurationDraft;
    if (
      !parsed || !Number.isInteger(parsed.expectedVersion) || !parsed.configuration
      || parsed.configuration.productId !== productId || parsed.configuration.schemaVersion !== 1
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function draftStorageKey(restaurantId: string, productId: string) {
  return `ordersawa:product-configuration-draft:${restaurantId}:${productId}:v1`;
}

export function configurationsEqual(left: ProductConfigurationV1, right: ProductConfigurationV1) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createGroup(type: "SIZE" | "OPTIONS"): ConfigurationGroup {
  if (type === "SIZE") {
    return {
      type,
      id: newNodeId("size-group"),
      label: "مجموعة أحجام جديدة",
      sizes: [{ id: newNodeId("size"), label: "حجم جديد", price: "0" }]
    };
  }
  return {
    type,
    id: newNodeId("options-group"),
    label: "مجموعة خيارات جديدة",
    min: 0,
    max: null,
    includedQuantity: 0,
    options: [{ id: newNodeId("option"), label: "خيار جديد", price: "0", maxQuantity: 1 }]
  };
}

export function createSize(): SizeChoice {
  return { id: newNodeId("size"), label: "حجم جديد", price: "0" };
}

export function createOption(): OptionChoice {
  return { id: newNodeId("option"), label: "خيار جديد", price: "0", maxQuantity: 1 };
}

function visitGroups(
  groups: ConfigurationGroup[],
  visitor: (node: EditableNode, ref: EditorNodeRef) => boolean | void
): boolean {
  for (const group of groups) {
    if (visitor(group, { kind: "group", id: group.id })) return true;
    const choices = group.type === "SIZE" ? group.sizes : group.options;
    for (const choice of choices) {
      if (visitor(choice, { kind: group.type === "SIZE" ? "size" : "option", id: choice.id })) return true;
      if (visitGroups(choice.children ?? [], visitor)) return true;
    }
  }
  return false;
}

export function findNode(configuration: ProductConfigurationV1, id: string): { node: EditableNode; ref: EditorNodeRef } | null {
  let result: { node: EditableNode; ref: EditorNodeRef } | null = null;
  visitGroups(configuration.groups, (node, ref) => {
    if (node.id !== id) return false;
    result = { node, ref };
    return true;
  });
  return result;
}

function mapGroups(
  groups: ConfigurationGroup[],
  id: string,
  update: (node: EditableNode) => EditableNode
): ConfigurationGroup[] {
  return groups.map((group) => {
    if (group.id === id) return update(group) as ConfigurationGroup;
    if (group.type === "SIZE") {
      return {
        ...group,
        sizes: group.sizes.map((size) => size.id === id
          ? update(size) as SizeChoice
          : { ...size, children: size.children ? mapGroups(size.children, id, update) : undefined })
      };
    }
    return {
      ...group,
      options: group.options.map((option) => option.id === id
        ? update(option) as OptionChoice
        : { ...option, children: option.children ? mapGroups(option.children, id, update) : undefined })
    };
  });
}

export function updateNode(
  configuration: ProductConfigurationV1,
  id: string,
  update: (node: EditableNode) => EditableNode
): ProductConfigurationV1 {
  return { ...configuration, groups: mapGroups(configuration.groups, id, update) };
}

export function appendRootGroup(configuration: ProductConfigurationV1, type: "SIZE" | "OPTIONS") {
  return { ...configuration, groups: [...configuration.groups, createGroup(type)] };
}

export function appendChildGroup(configuration: ProductConfigurationV1, choiceId: string, type: "SIZE" | "OPTIONS") {
  return updateNode(configuration, choiceId, (node) => ({
    ...node,
    children: [...("children" in node && node.children ? node.children : []), createGroup(type)]
  } as EditableNode));
}

export function appendChoice(configuration: ProductConfigurationV1, groupId: string) {
  return updateNode(configuration, groupId, (node) => {
    if (!("type" in node)) return node;
    return node.type === "SIZE"
      ? { ...node, sizes: [...node.sizes, createSize()] }
      : { ...node, options: [...node.options, createOption()] };
  });
}

function removeFromGroups(groups: ConfigurationGroup[], ref: EditorNodeRef): ConfigurationGroup[] {
  return groups
    .filter((group) => !(ref.kind === "group" && group.id === ref.id))
    .map((group) => group.type === "SIZE"
      ? {
          ...group,
          sizes: group.sizes
            .filter((size) => !(ref.kind === "size" && size.id === ref.id))
            .map((size) => ({ ...size, children: size.children ? removeFromGroups(size.children, ref) : undefined }))
        }
      : {
          ...group,
          options: group.options
            .filter((option) => !(ref.kind === "option" && option.id === ref.id))
            .map((option) => ({ ...option, children: option.children ? removeFromGroups(option.children, ref) : undefined }))
        });
}

export function removeNode(configuration: ProductConfigurationV1, ref: EditorNodeRef) {
  return { ...configuration, groups: removeFromGroups(configuration.groups, ref) };
}

function moveInArray<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return null;
  const moved = [...items];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

function moveInGroups(groups: ConfigurationGroup[], ref: EditorNodeRef, direction: -1 | 1): [ConfigurationGroup[], boolean] {
  if (ref.kind === "group") {
    const moved = moveInArray(groups, ref.id, direction);
    if (moved) return [moved, true];
  }
  let changed = false;
  const next = groups.map((group) => {
    if (changed) return group;
    if (group.type === "SIZE") {
      if (ref.kind === "size") {
        const sizes = moveInArray(group.sizes, ref.id, direction);
        if (sizes) { changed = true; return { ...group, sizes }; }
      }
      return {
        ...group,
        sizes: group.sizes.map((size) => {
          if (changed || !size.children) return size;
          const [children, childChanged] = moveInGroups(size.children, ref, direction);
          changed ||= childChanged;
          return childChanged ? { ...size, children } : size;
        })
      };
    }
    if (ref.kind === "option") {
      const options = moveInArray(group.options, ref.id, direction);
      if (options) { changed = true; return { ...group, options }; }
    }
    return {
      ...group,
      options: group.options.map((option) => {
        if (changed || !option.children) return option;
        const [children, childChanged] = moveInGroups(option.children, ref, direction);
        changed ||= childChanged;
        return childChanged ? { ...option, children } : option;
      })
    };
  });
  return [next, changed];
}

export function moveNode(configuration: ProductConfigurationV1, ref: EditorNodeRef, direction: -1 | 1) {
  return { ...configuration, groups: moveInGroups(configuration.groups, ref, direction)[0] };
}

export function collectSizeChoices(configuration: ProductConfigurationV1) {
  const sizes: Array<{ groupId: string; groupLabel: string; size: SizeChoice }> = [];
  visitGroups(configuration.groups, (node) => {
    if ("type" in node && node.type === "SIZE") {
      node.sizes.forEach((size) => sizes.push({ groupId: node.id, groupLabel: node.label, size }));
    }
  });
  return sizes;
}

export function countDescendants(node: EditableNode) {
  let count = 0;
  const children = "children" in node ? node.children ?? [] : [];
  visitGroups(children, () => { count += 1; });
  if ("type" in node) count += node.type === "SIZE" ? node.sizes.length : node.options.length;
  return count;
}

export function collectPriceNodes(configuration: ProductConfigurationV1) {
  const nodes: Array<{ id: string; label: string; kind: "SIZE" | "OPTION"; price: string }> = [];
  visitGroups(configuration.groups, (node, ref) => {
    if (ref.kind === "size") nodes.push({ id: node.id, label: node.label, kind: "SIZE", price: (node as SizeChoice).price });
    if (ref.kind === "option") nodes.push({ id: node.id, label: node.label, kind: "OPTION", price: (node as OptionChoice).price });
  });
  return nodes;
}
