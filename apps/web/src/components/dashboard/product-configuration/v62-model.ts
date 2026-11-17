import { eligibleSizeGroups, validateConfigurationV2, validateGroupLevelsV2, collectDependencyEdgesV2,
  resolveLinkedConfigurationV2, configurationContainsSizeV2, cloneCustomConfigurationV2, type ProductConfigurationV2 as Config,
  type ConfigurationGroupV2 as Group, type SizeGroupV2 as SizeGroup, type OptionChoiceV2 as Option,
  type SizeChoiceV2 as Size, type ProductEditorAggregate, type ProductConfigurationContextV2 } from "@menu/shared";

export type Node = Group | Size | Option;
export type Ref = { id: string; path: string[]; original?: { owner: string; source: string; linkedPath?: string[] } };
export type Location = { node: Node; kind: "group" | "size" | "option"; config: Config; path: string[];
  list: Node[]; container: string; index: number; level: number; group?: Group; scopes: SizeGroup[]; underSize: boolean };
export type Destination = { path: string[]; container: string; index: number };
export type SourceMap = ReadonlyMap<string, ProductEditorAggregate>;
export const newId = () => crypto.randomUUID();
export const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const keyOf = (ref: Ref) => JSON.stringify(ref);
export const emptyConfiguration = (id: string, basePrice: string | null): Config =>
  ({ schemaVersion: 2, productId: id, revision: 1, basePrice, groups: [] });
export function createGroup(type: Group["type"]): Group {
  const common = { id: newId(), label: type === "SIZE" ? "الأحجام" : "مجموعة خيارات", hidePublicLabel: type !== "SIZE", children: [] };
  return type === "SIZE" ? { ...common, type, sizes: [] }
    : { ...common, type, min: 0, max: null, includedQuantity: 0, options: [] };
}
export const createSize = (): Size => ({ id: newId(), label: "", price: "" });
export const createOption = (): Option => ({ id: newId(), label: "", price: "0", minQuantity: 0, maxQuantity: null, children: [] });

export function walk(config: Config, visit: (location: Location) => void, path: string[] = [], level = 1) {
  function groups(list: Group[], container: string, depth: number, ancestor?: SizeGroup) {
    list.forEach((group, index) => {
      const scopes = eligibleSizeGroups(list, ancestor);
      visit({ node: group, config, path, list, container, index, kind: "group", level: depth, scopes, underSize: !!ancestor });
      const choices = group.type === "SIZE" ? group.sizes : group.options;
      choices.forEach((node, index) => {
        const location: Location = { node, config, path, list: choices, container: "choices:" + group.id, index,
          kind: group.type === "SIZE" ? "size" : "option", level: depth, group, scopes, underSize: !!ancestor || group.type === "SIZE" };
        visit(location);
        if ("maxQuantity" in node) {
          const option = node as Option;
          groups(option.children ?? [], "children:" + option.id, depth + 1, ancestor);
          if (option.linkedProduct?.mode === "CUSTOM" && option.linkedProduct.customConfiguration)
            walk(option.linkedProduct.customConfiguration, visit, [...path, option.id], depth + 1);
        }
      });
      groups(group.children ?? [], "children:" + group.id, depth + 1, group.type === "SIZE" ? group : ancestor);
    });
  }
  groups(config.groups, "root", level);
}
export function configAt(root: Config, path: readonly string[]): Config | undefined {
  let config: Config | undefined = root;
  for (const owner of path) {
    let next: Config | undefined;
    if (config) walk(config, loc => {
      if (!loc.path.length && loc.node.id === owner && "maxQuantity" in loc.node)
        next = loc.node.linkedProduct?.customConfiguration;
    });
    config = next;
  }
  return config;
}
export function locate(root: Config, ref: Ref): Location | undefined {
  let result: Location | undefined;
  walk(root, loc => { if (JSON.stringify(loc.path) === JSON.stringify(ref.path) && loc.node.id === ref.id) result = loc; });
  return result;
}
export function updateNode(root: Config, ref: Ref, change: (node: Node) => void): Config {
  const next = copy(root), location = locate(next, ref);
  if (location && !ref.original) change(location.node);
  return next;
}
export function containerAt(root: Config, destination: Destination): Node[] | undefined {
  const config = configAt(root, destination.path);
  if (!config) return;
  if (destination.container === "root") return config.groups;
  const [kind, id] = destination.container.split(":");
  const loc = locate(root, { id, path: destination.path });
  if (!loc) return;
  if (kind === "choices" && "type" in loc.node) return loc.node.type === "SIZE" ? loc.node.sizes : loc.node.options;
  if (kind === "children" && ("type" in loc.node || "maxQuantity" in loc.node)) return loc.node.children ??= [];
}
export function insertGroup(root: Config, destination: Destination, type: Group["type"]): { configuration: Config; ref: Ref } {
  const configuration = copy(root), list = containerAt(configuration, destination), group = createGroup(type);
  if (!list || destination.container.startsWith("choices:")) throw new Error("الحاوية لا تقبل مجموعة.");
  list.splice(destination.index, 0, group);
  return { configuration, ref: { id: group.id, path: destination.path } };
}
export function deleteNode(root: Config, ref: Ref): Config {
  const next = copy(root), loc = locate(next, ref);
  if (!loc || ref.original) return root;
  if (loc.kind === "size" && loc.list.length === 1) throw new Error("لا يمكن حذف الحجم الأخير وحده. أضف حجمًا آخر أو احذف مجموعة الأحجام لتنظيف نطاقاتها.");
  loc.list.splice(loc.index, 1);
  // Size IDs are local to this configuration domain; never rewrite ORIGINAL external scopes.
  if (loc.kind === "size" || loc.kind === "group" && "type" in loc.node && loc.node.type === "SIZE") {
    const groupId = loc.kind === "size" ? loc.group!.id : loc.node.id;
    const deleted = loc.kind === "size" ? [loc.node.id] : (loc.node as SizeGroup).sizes.map(s => s.id);
    walk(loc.config, x => {
      if (x.path.length || !("maxQuantity" in x.node) || x.node.priceBySize?.sizeGroupId !== groupId) return;
      if (loc.kind === "group") delete x.node.priceBySize;
      else for (const id of deleted) delete (x.node.priceBySize!.overrides as Record<string, string | null>)[id];
    });
  }
  return next;
}
const structuralCodes = new Set(["GROUP_LEVEL_LIMIT", "SIZE_AFTER_SIZE", "LINK_CYCLE", "INVALID_SIZE_PRICING",
  "UNKNOWN_SIZE_PRICE_OVERRIDE", "INVALID_SIZE_GROUP_REFERENCE", "SIZE_PRICING_SCOPE", "DUPLICATE_NODE_ID"]);
export function moveNode(root: Config, ref: Ref, destination: Destination, sources: SourceMap): Config {
  if (ref.original || keyOf({ id: "", path: ref.path }) !== keyOf({ id: "", path: destination.path }))
    throw new Error("لا يمكن نقل العقد بين منتجات Linked المستقلة.");
  const next = copy(root), from = locate(next, ref);
  if (!from) throw new Error("العقدة غير موجودة.");
  const list = containerAt(next, destination);
  if (!list) throw new Error("حاوية إسقاط غير صالحة.");
  const choices = destination.container.startsWith("choices:");
  if ((from.kind === "group") === choices) throw new Error("نوع العقدة غير مناسب للحاوية.");
  if (choices) {
    const group = locate(next, { id: destination.container.slice(8), path: destination.path })?.node;
    if (!group || !("type" in group) || (from.kind === "size") !== (group.type === "SIZE")) throw new Error("الأحجام والخيارات لها حاويات مختلفة.");
  }
  const owned = new Set<string>();
  if ("type" in from.node) walk({ ...from.config, groups: [from.node] }, x => owned.add(x.node.id));
  else if ("maxQuantity" in from.node) walk({ ...from.config, groups: from.node.children ?? [] }, x => owned.add(x.node.id));
  owned.add(from.node.id);
  if (destination.container !== "root" && owned.has(destination.container.split(":")[1])) throw new Error("لا يمكن إسقاط العقدة داخل نفسها أو أحد فروعها.");
  from.list.splice(from.index, 1);
  list.splice(Math.max(0, destination.index - (list === from.list && destination.index > from.index ? 1 : 0)), 0, from.node);
  const levels = validateGroupLevelsV2(next, id => sources.get(id)?.configuration ?? undefined);
  const issues = validateConfigurationV2(next).filter(x => structuralCodes.has(x.code) || /SCOPE|SIZE.*REFERENCE|SIZE.*OVERRIDE/.test(x.code));
  if (levels.length || issues.length) throw new Error("النقل يكسر مستويات التداخل أو نطاق أسعار الأحجام: " + (levels[0]?.message ?? issues[0]?.message));
  return next;
}
export function sourceConfiguration(source: ProductEditorAggregate): Config {
  return source.configuration ?? emptyConfiguration(source.id, source.product.basePrice);
}
export function attachLinked(root: Config, ref: Ref, source: ProductEditorAggregate, mode: "ORIGINAL" | "CUSTOM"): Config {
  const sourceTree = sourceConfiguration(source);
  if (mode === "ORIGINAL" && !source.configuration) throw new Error("ORIGINAL يحتاج شبكة V2 محفوظة في المصدر؛ يمكن استخدام CUSTOM للمنتج العادي.");
  if (source.id === root.productId || source.dependencies.some(edge => edge.sourceProductId === root.productId))
    throw new Error("الربط ينشئ دورة.");
  return updateNode(root, ref, node => {
    if (!("maxQuantity" in node)) return;
    node.label = source.product.name;
    if (mode === "CUSTOM") {
      const custom = cloneCustomConfigurationV2(sourceTree, newId);
      custom.basePrice = "0";
      node.linkedProduct = { sourceProductId: source.id, mode, customConfiguration: custom };
    } else node.linkedProduct = { sourceProductId: source.id, mode, originalPriceOverrides: {} };
  });
}
export function pricingContext(restaurantId: string, currency: string, sources: SourceMap): ProductConfigurationContextV2 {
  return { catalogId: restaurantId, currency, linkedProducts: new Map([...sources].map(([id, source]) => [id, {
    productId: id, catalogId: restaurantId, configuration: sourceConfiguration(source)
    // Admin can configure and preview unavailable drafts; this never changes public availability.
  }])) };
}
export function originalTree(root: Config, owner: Ref, sources: SourceMap, restaurantId: string, currency: string): Config | null {
  const node = locate(root, owner)?.node;
  if (!node || !("maxQuantity" in node) || !node.linkedProduct) return null;
  return resolveLinkedConfigurationV2(node.linkedProduct, pricingContext(restaurantId, currency, sources),
    "$admin", [root.productId]).resolved?.configuration ?? null;
}
/** Nested linked domains inside an ORIGINAL source are inspectable, never writable through its price overlay. */
export function originalView(root: Config, ref: Ref, sources: SourceMap, restaurantId: string, currency: string): Config | null {
  if (!ref.original) return null;
  let tree = originalTree(root, { id: ref.original.owner, path: ref.path }, sources, restaurantId, currency);
  const stack = [root.productId, ...(tree ? [tree.productId] : [])];
  for (const ownerId of ref.original.linkedPath ?? []) {
    const node = tree && locate(tree, { id: ownerId, path: [] })?.node;
    if (!node || !("maxQuantity" in node) || !node.linkedProduct) return null;
    const result = resolveLinkedConfigurationV2(node.linkedProduct, pricingContext(restaurantId, currency, sources), "$admin.nested", stack);
    if (result.issues.length || !result.resolved) return null;
    tree = result.resolved.configuration; stack.push(tree.productId);
  }
  return tree;
}
export function hasSizes(root: Config, sources: SourceMap, seen = new Set<string>()): boolean {
  if (seen.has(root.productId)) return false;
  seen.add(root.productId);
  if (configurationContainsSizeV2(root.groups)) return true;
  let found = false;
  walk(root, loc => {
    if ("maxQuantity" in loc.node && loc.node.linkedProduct?.mode === "ORIGINAL") {
      const source = sources.get(loc.node.linkedProduct.sourceProductId)?.configuration;
      if (source && hasSizes(source, sources, seen)) found = true;
    }
  });
  return found;
}
export function shouldFrame(node: { highlightInPriceSummary?: boolean; hidePublicLabel?: boolean; label: string }, ancestor: boolean) {
  return !ancestor && node.highlightInPriceSummary === true && !node.hidePublicLabel && !!node.label.trim();
}
export function issueNode(root: Config, path: string): Ref | undefined {
  // Validators use structural indices; IDs also occur in currency/resolved-level issue paths.
  let result: Ref | undefined;
  const translated = path.replaceAll(".choices[", ".sizes[");
  try {
    const tokens = translated.replace(/^\$configuration\.?/, "").match(/[a-zA-Z]+|\d+/g) ?? [];
    let node: unknown = root, last: Node | undefined;
    const domain: string[] = [];
    for (const token of tokens) {
      if (token === "customConfiguration" && last && "maxQuantity" in last) domain.push(last.id);
      const record = node as Record<string, unknown> | undefined;
      if (token === "sizes" && record && !("sizes" in record) && "options" in record) node = record.options;
      else node = record?.[token];
      if (node && typeof node === "object" && "id" in node) last = node as Node;
    }
    if (last) result = { id: last.id, path: domain };
  } catch { /* ID-based paths below. */ }
  if (!result) walk(root, x => { if (path.includes(x.node.id)) result = { id: x.node.id, path: x.path }; });
  return result;
}
