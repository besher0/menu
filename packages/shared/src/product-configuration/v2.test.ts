import { describe, expect, it } from "vitest";
import type { ConfigurationGroup, OptionChoice, OptionGroup, ProductConfigurationV2, ProductSelectionV2, ProductConfigurationContext, SizeGroup } from "./v2-types";
import { validateConfiguration, validateGroupLevels } from "./validation";
import { validateSelection } from "./selection";
import { calculatePrice } from "./pricing";
import { calculateMinimumPrice } from "./minimum-price";
import { createConfigurationSnapshot, createSelectionKey } from "./snapshot";
import { collectDependencyEdges, validateDependencyGraph } from "./dependencies";
import { cloneCustomConfigurationV2, completeAnonymousSelectionV2, validateConfigurationCurrencyV2 } from "./v2-helpers";
import { eligibleSizeGroups } from "./scope";
import { calculatePrice as pendingPrice, validateConfiguration as pendingValidation } from "./integration-boundary";
const context: ProductConfigurationContext = { catalogId: "tenant", currency: "SYP", linkedProducts: new Map() };
const opt = (id = "o", price = "10", patch: Partial<OptionChoice> = {}): OptionChoice => ({ id, label: id, price, maxQuantity: null, ...patch });
const group = (id = "g", options = [opt()], patch: Partial<OptionGroup> = {}): OptionGroup => ({ type: "OPTIONS", id, label: id, min: 1, max: null, includedQuantity: 0, options, ...patch });
const sizes = (id = "sizes", patch: Partial<SizeGroup> = {}): SizeGroup => ({ type: "SIZE", id, label: id, sizes: [{ id: id + "-s", label: "S", price: "100" }, { id: id + "-m", label: "M", price: "200" }, { id: id + "-l", label: "L", price: "300" }], ...patch });
const config = (groups: ConfigurationGroup[] = [], basePrice: string | null = "0", id = "p"): ProductConfigurationV2 => ({ schemaVersion: 2, productId: id, revision: 1, basePrice, groups });
const selected = (groups: ProductSelectionV2["groups"] = [], id = "p"): ProductSelectionV2 => ({ schemaVersion: 2, productId: id, configurationRevision: 1, groups });
const pick = (g = "g", o = "o", id = "u") => ({ type: "OPTIONS" as const, groupId: g, instances: [{ instanceId: id, optionId: o }] });
const codes = (tree: ProductConfigurationV2) => validateConfiguration(tree).map(x => x.code);
const linkedContext = (source: ProductConfigurationV2, patch = {}): ProductConfigurationContext => ({ ...context, linkedProducts: new Map([[source.productId, { productId: source.productId, catalogId: "tenant", configuration: source, ...patch }]]) });
function linked(source: ProductConfigurationV2, mode: "ORIGINAL" | "CUSTOM", originalPriceOverrides = {}) {
  return config([group("link", [opt("linked", "5", { linkedProduct: { sourceProductId: source.productId, mode,
          ...(mode === "CUSTOM" ? { customConfiguration: source } : { originalPriceOverrides }) } })])]);
}
describe("V2 structural and scope validation", () => {
  it("has exactly V2 contracts and refuses the retired V1 entry point", () => {
    expect(codes(config())).toEqual([]);
    expect(codes({ ...config(), schemaVersion: 1 } as unknown as ProductConfigurationV2)).toContain("UNSUPPORTED_CONFIGURATION_VERSION");
    expect(pendingValidation(config() as never)[0].code).toBe("UNSUPPORTED_CONFIGURATION_V1");
    expect(pendingPrice(config() as never, selected() as never, context as never).valid).toBe(false);
  });
  it.each([null, [], {}, { groups: [null] }, { ...config(), groups: [{ type: "oops" }] }])("rejects malformed JSON without throwing (%j)", input => {
    expect(validateConfiguration(input as ProductConfigurationV2).length).toBeGreaterThan(0);
  });
  it("accepts shared and instance branches at level three and rejects level four", () => {
    const leaf = group("leaf", [opt("leaf-choice")]);
    const middle = group("middle", [opt("middle-choice", "0")], { children: [leaf] });
    const root = group("root", [opt("root-choice", "0", { children: [middle] })]);
    expect(codes(config([root]))).toEqual([]);
    leaf.children = [group("fourth", [opt("fourth-choice")])];
    expect(codes(config([root]))).toContain("GROUP_LEVEL_LIMIT");
  });
  it("accepts sibling Sizes and rejects Size on the same path or SizeChoice children", () => {
    expect(codes(config([sizes(), sizes("other")]))).toEqual([]);
    expect(codes(config([sizes("sizes", { children: [sizes("nested")] })]))).toContain("SIZE_AFTER_SIZE");
    const invalid = sizes();
    Object.assign(invalid.sizes[0], { children: [] });
    expect(codes(config([invalid]))).toContain("SIZE_CHOICE_HAS_CHILDREN");
  });
  it.each([
    [group("g", []), "EMPTY_OPTIONS_GROUP"],
    [group("g", [opt("o"), opt("o")]), "DUPLICATE_NODE_ID"],
    [group(""), "REQUIRED_TEXT"],
    [group("g", [opt("o", "10", { maxQuantity: 3 })], { max: 2 }), "OPTION_MAX_EXCEEDS_GROUP_MAX"],
    [group("g", [opt()], { min: 3, max: 2 }), "GROUP_MIN_EXCEEDS_MAX"],
    [group("g", [opt()], { includedQuantity: 3, max: 2 }), "INCLUDED_EXCEEDS_GROUP_MAX"]
  ])("rejects invalid structure %s", (g, code) => expect(codes(config([g as OptionGroup]))).toContain(code));
  it("validates ancestor scope with the same resolver as pricing", () => {
    const g = group("g", [opt("o", "9", { priceBySize: { sizeGroupId: "sizes", overrides: { "sizes-s": "2" } } })]);
    const tree = config([sizes("sizes", { children: [g] })]);
    expect(codes(tree)).toEqual([]);
    const s = selected([{ type: "SIZE", groupId: "sizes", sizeChoiceId: "sizes-s", children: [pick()] }]);
    expect(calculatePrice(tree, s, context).total).toBe("102");
  });
  it("requires an explicit eligible target and never leaks into a separate option branch", () => {
    const g = group("g", [opt("o", "9", { priceBySize: { sizeGroupId: "outside", overrides: {} } })]);
    const tree = config([sizes(), group("root", [opt("a", "0", { children: [g] })])]);
    expect(codes(tree)).toContain("INVALID_SIZE_PRICING_SCOPE");
    g.options[0].priceBySize = { sizeGroupId: "sizes", overrides: {} };
    expect(codes(tree)).toContain("INVALID_SIZE_PRICING_SCOPE");
    expect(eligibleSizeGroups([sizes(), sizes("other")]).map(g => g.id)).toEqual(["sizes", "other"]);
  });
  it("rejects keys outside the target even if another sibling has that size", () => {
    const g = group("g", [opt("o", "9", { priceBySize: { sizeGroupId: "sizes", overrides: { "other-s": "2" } } })]);
    expect(codes(config([sizes(), sizes("other"), g]))).toContain("UNKNOWN_SIZE_PRICE_OVERRIDE");
  });
  it("bounds cyclic or excessive inline graphs", () => {
    const tree = config([group()]);
    tree.groups[0].children = tree.groups;
    expect(codes(tree)).toContain("INLINE_CONFIGURATION_CYCLE");
    expect(calculatePrice(tree, selected(), context).valid).toBe(false);
    expect(calculatePrice(null as never, selected(), context).valid).toBe(false);
    expect(() => validateConfiguration(config(), { maxNodes: 100000 })).toThrow();
    expect(validateConfiguration(config([group()]), { maxNodes: 1 }).map(i => i.code)).toContain("NODE_LIMIT_EXCEEDED");
  });
  it("permits null maxima, counts repeated units, and enforces platform caps", () => {
    const tree = config([group("g", [opt()], { min: 2, max: 2 })]);
    const s = selected([{ ...pick(), instances: [{ instanceId: "u1", optionId: "o" }, { instanceId: "u2", optionId: "o" }] }]);
    expect(validateSelection(tree, s, context)).toEqual([]);
    expect(calculatePrice(tree, s, context).total).toBe("20");
    const tooMany = selected([{ ...pick(), instances: Array.from({ length: 101 }, (_, i) => ({ instanceId: String(i), optionId: "o" })) }]);
    expect(validateSelection(config([group()]), tooMany, context).map(x => x.code)).toContain("GROUP_MAX_EXCEEDED");
  });
});
describe("V2 Decimal pricing and shared branches", () => {
  it.each([["sizes-s", "101"], ["sizes-m", "202"], ["sizes-l", "303"]])("prices a selected size with its own override %s", (size, total) => {
    const tree = config([sizes(), group("g", [opt("o", "9", { priceBySize: { sizeGroupId: "sizes", overrides: { "sizes-s": "1", "sizes-m": "2", "sizes-l": "3" } } })])], "900");
    expect(calculatePrice(tree, selected([{ type: "SIZE", groupId: "sizes", sizeChoiceId: size }, pick()]), context)).toMatchObject({ valid: true, total, baseIgnored: true });
    expect(calculateMinimumPrice(tree, context).minimum).toBe("101");
  });
  it.each([[null, "107"], ["0", "100"], [undefined, "107"]])("distinguishes null, missing and explicit zero (%s)", (value, total) => {
    const overrides: Record<string, string | null> = value === undefined ? {} : { "sizes-s": value };
    const tree = config([sizes(), group("g", [opt("o", "7", { priceBySize: { sizeGroupId: "sizes", overrides } })])]);
    expect(calculatePrice(tree, selected([{ type: "SIZE", groupId: "sizes", sizeChoiceId: "sizes-s" }, pick()]), context).total).toBe(total);
  });
  it("evaluates each complete size/required-price pair for the minimum", () => {
    const tree = config([sizes(), group("g", [opt("o", "0", { priceBySize: { sizeGroupId: "sizes", overrides: { "sizes-s": "500", "sizes-m": "1", "sizes-l": "5" } } })])]);
    expect(calculateMinimumPrice(tree, context)).toMatchObject({ minimum: "201", maximumRequired: "600" });
  });
  it("charges OPTIONS shared children once and private children per selected unit", () => {
    const privateGroup = group("private", [opt("private-o", "3")]);
    const common = group("shared", [opt("shared-o", "7")]);
    const tree = config([group("g", [opt("o", "10", { children: [privateGroup] })], { min: 2, max: 2, children: [common] })]);
    const s = selected([{ type: "OPTIONS", groupId: "g", instances: [
          { instanceId: "a", optionId: "o", children: [pick("private", "private-o", "pa")] },
          { instanceId: "b", optionId: "o", children: [pick("private", "private-o", "pb")] }
        ], children: [pick("shared", "shared-o", "sh")] }]);
    expect(calculatePrice(tree, s, context).total).toBe("33");
    expect(calculateMinimumPrice(tree, context).minimum).toBe("33");
    const inactive = config([group("g", [opt()], { min: 0, children: [common] })], "10");
    expect(calculatePrice(inactive, selected(), context).total).toBe("10");
    expect(calculateMinimumPrice(inactive, context).minimum).toBe("10");
  });
  it("charges SIZE shared children once", () => {
    const tree = config([sizes("sizes", { children: [group()] })]);
    expect(calculatePrice(tree, selected([{ type: "SIZE", groupId: "sizes", sizeChoiceId: "sizes-s", children: [pick()] }]), context).total).toBe("110");
  });
  it("includes the highest effective units without freeing their branches", () => {
    const tree = config([sizes(), group("g", [
        opt("a", "100"), opt("b", "200"), opt("c", "300", { priceBySize: { sizeGroupId: "sizes", overrides: { "sizes-s": "50" } }, children: [group("child", [opt("child-o", "9")])] })
      ], { min: 3, max: 3, includedQuantity: 2 })]);
    const s = selected([{ type: "SIZE", groupId: "sizes", sizeChoiceId: "sizes-s" }, { type: "OPTIONS", groupId: "g", instances: [
          { instanceId: "a", optionId: "a" }, { instanceId: "b", optionId: "b" }, { instanceId: "c", optionId: "c", children: [pick("child", "child-o", "child-unit")] }
        ] }]);
    const result = calculatePrice(tree, s, context);
    expect(result.total).toBe("159");
    expect(result.lines.filter(l => l.included).map(l => l.amount)).toEqual(["100", "200"]);
  });
  it("refuses malformed and stale selections", () => {
    for (const s of [null, {}, { ...selected(), schemaVersion: 1 }, { ...selected(), configurationRevision: 0 }, selected([null as never])]) {
      expect(validateSelection(config([group()]), s as ProductSelectionV2, context).length).toBeGreaterThan(0);
    }
  });
  it("never substitutes an approximate minimum after exhausting the budget", () => {
    expect(calculateMinimumPrice(config([sizes(), group()]), { ...context, limits: { maxMinimumPriceStates: 1 } }))
      .toMatchObject({ orderable: false, minimum: null, display: "UNAVAILABLE" });
  });
  it("binds one of two sibling size groups explicitly", () => {
    const tree = config([sizes(), sizes("other"), group("g", [opt("o", "9", { priceBySize: { sizeGroupId: "other", overrides: { "other-l": "3" } } })])]);
    const s = selected([{ type: "SIZE", groupId: "sizes", sizeChoiceId: "sizes-s" }, { type: "SIZE", groupId: "other", sizeChoiceId: "other-l" }, pick()]);
    expect(calculatePrice(tree, s, context).total).toBe("403");
    (tree.groups[2] as OptionGroup).options[0].priceBySize!.sizeGroupId = "";
    expect(codes(tree)).toContain("INVALID_SIZE_PRICING_SCOPE");
  });
  it("retains distinct private choices for repeated units of the same option", () => {
    const tree = config([group("g", [opt("o", "10", { children: [group("private", [opt("cheap", "1"), opt("premium", "9")])] })], { min: 2, max: 2, includedQuantity: 1 })]);
    const s = selected([{ type: "OPTIONS", groupId: "g", instances: [
          { instanceId: "first", optionId: "o", children: [pick("private", "cheap", "first-child")] },
          { instanceId: "second", optionId: "o", children: [pick("private", "premium", "second-child")] }
        ] }]);
    expect(calculatePrice(tree, s, context).total).toBe("20");
    const other = structuredClone(s);
    (other.groups[0] as any).instances[1].children = [pick("private", "cheap", "different")];
    expect(createSelectionKey(s)).not.toBe(createSelectionKey(other));
  });
  it("rejects active shared selections submitted for inactive groups", () => {
    const tree = config([group("g", [opt()], { min: 0, children: [group("child", [opt("child-o")])] })]);
    expect(validateSelection(tree, selected([{ type: "OPTIONS", groupId: "g", instances: [], children: [pick("child", "child-o")] }]), context).map(i => i.code)).toContain("INACTIVE_SHARED_SELECTION");
  });
  it("tightens money precision to integer without changing Decimal helpers", () => {
    expect(validateConfiguration(config([], "1.5"), { maxMoneyScale: 0 }).map(i => i.code)).toContain("MONEY_SCALE_TOO_LARGE");
  });
  it("uses bounded internal instance IDs for valid long node IDs", () => {
    const tree = config([group("g".repeat(500), [opt("o".repeat(500))])]);
    expect(calculateMinimumPrice(tree, context)).toMatchObject({orderable:true,minimum:"10"});
  });
  it.each(["", "-1", "1e2", "NaN", "1.0000001"])("rejects invalid money %s", price => {
    expect(calculatePrice(config([group("g", [opt("o", price)])]), selected([pick()]), context).valid).toBe(false);
  });
  it.each(["SYP", "EUR", "USD", "AED"])("enforces currency precision %s", currency => {
    const tree = config([group("g", [opt("o", currency === "SYP" ? "100" : "0.1")])], currency === "SYP" ? "0" : "0.2");
    expect(calculatePrice(tree, selected([pick()]), { ...context, currency }).total).toBe(currency === "SYP" ? "100" : "0.3");
    expect(validateConfigurationCurrencyV2(config([group("g", [opt("o", "1.001")])]), currency).length).toBeGreaterThan(0);
  });
});
describe("V2 linked products, identity and forced choices", () => {
  const source = config([sizes(), group("g", [opt("o", "999", { priceBySize: { sizeGroupId: "sizes", overrides: { "sizes-s": "888" } } })])], "9000", "source");
  const sourcePick = (size = "sizes-s"): ProductSelectionV2 => selected([{ type: "SIZE", groupId: "sizes", sizeChoiceId: size }, pick("g", "o", "source-unit")], "source");
  it("uses only ORIGINAL local prices, with absent nodes equal to zero", () => {
    const tree = linked(source, "ORIGINAL", { "sizes-s": { price: "40" }, o: { price: "2", priceBySize: { sizeGroupId: "sizes", overrides: { "sizes-s": "3" } } } });
    const s = selected([{ ...pick("link", "linked"), instances: [{ instanceId: "link", optionId: "linked", linkedSelection: sourcePick() }] }]);
    expect(calculatePrice(tree, s, linkedContext(source)).total).toBe("48");
    expect(calculateMinimumPrice(tree, linkedContext(source)).minimum).toBe("7");
    expect(source.groups[0]).toEqual(sizes()); // source untouched
  });
  it("keeps repeated linked sizes and private selections in separate instances", () => {
    const tree = linked(source, "CUSTOM");
    const g = tree.groups[0] as OptionGroup;
    g.min = 2;
    const s = selected([{ type: "OPTIONS", groupId: "link", instances: [
          { instanceId: "first", optionId: "linked", linkedSelection: sourcePick("sizes-s") },
          { instanceId: "second", optionId: "linked", linkedSelection: { ...sourcePick("sizes-l"), groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "sizes-l" }, pick("g", "o", "second-source-unit")] } }
        ] }]);
    expect(calculatePrice(tree, s, linkedContext(source)).total).toBe("2297"); // 5+100+888 and 5+300+999
  });
  it("does not inherit a parent's size into a linked product", () => {
    const badSource = config([group("g", [opt("o", "1", { priceBySize: { sizeGroupId: "sizes", overrides: {} } })])], "0", "source");
    const tree = linked(badSource, "CUSTOM");
    tree.groups.unshift(sizes());
    expect(codes(tree)).toContain("INVALID_SIZE_PRICING_SCOPE");
  });
  it.each([{ catalogId: "other" }, { available: false }, { orderable: false }])("refuses invalid linked sources (%j)", patch => {
    expect(calculateMinimumPrice(linked(source, "CUSTOM"), linkedContext(source, patch)).orderable).toBe(false);
  });
  it("refuses missing sources, invalid local references and cycles", () => {
    expect(calculateMinimumPrice(linked(source, "ORIGINAL"), context).orderable).toBe(false);
    expect(calculateMinimumPrice(linked(source, "ORIGINAL", { missing: { price: "5" } }), linkedContext(source)).orderable).toBe(false);
    const self = config([group("g", [opt("o", "0", { linkedProduct: { sourceProductId: "p", mode: "ORIGINAL" } })])]);
    expect(codes(self)).toContain("SELF_LINK");
    const a = config([group("a", [opt("a-o", "0", { linkedProduct: { sourceProductId: "b", mode: "ORIGINAL" } })])], "0", "a");
    const b = config([group("b", [opt("b-o", "0", { linkedProduct: { sourceProductId: "a", mode: "ORIGINAL" } })])], "0", "b");
    expect(validateDependencyGraph([{ productId: "a", catalogId: "tenant", configuration: a }, { productId: "b", catalogId: "tenant", configuration: b }]).map(i => i.code)).toContain("LINK_CYCLE");
  });
  it("counts resolved levels and collects dependencies inside shared children", () => {
    const tree = config([group("g", [opt()], { children: [group("child", [opt("link", "0", { linkedProduct: { sourceProductId: "source", mode: "ORIGINAL" } })])] })]);
    expect(collectDependencyEdges(tree)[0]).toMatchObject({ sourceProductId: "source", optionId: "link" });
    expect(validateGroupLevels(tree, () => config([group("third", [opt("third-o", "0", { children: [group("fourth", [opt("fourth-o")])] })])], "0", "source")).map(i => i.code)).toContain("GROUP_LEVEL_LIMIT");
  });
  it("remaps both group and size references when making a CUSTOM copy", () => {
    let seq = 0;
    const cloned = cloneCustomConfigurationV2(source, () => "copy-" + (++seq));
    expect(codes(cloned)).toEqual([]);
    expect((cloned.groups[1] as OptionGroup).options[0].priceBySize?.sizeGroupId).toBe(cloned.groups[0].id);
    expect(Object.keys((cloned.groups[1] as OptionGroup).options[0].priceBySize!.overrides)).toEqual([(cloned.groups[0] as SizeGroup).sizes[0].id]);
    expect(() => cloneCustomConfigurationV2(source, () => "duplicate")).toThrow();
  });
  it("autoselects only a forced available anonymous single and retains option stars", () => {
    const tree = config([group("g", [opt("o", "10", { highlightInPriceSummary: true })], { hidePublicLabel: true, min: 1, max: 1 })]);
    const done = completeAnonymousSelectionV2(tree, selected(), context);
    expect(done.issues).toEqual([]);
    expect(calculatePrice(tree, done.selection, context).total).toBe("10");
    expect(completeAnonymousSelectionV2(tree, done.selection, context).selection).toEqual(done.selection);
    const optional = config([group("g", [opt()], { hidePublicLabel: true, min: 0, max: 1 })]);
    expect(completeAnonymousSelectionV2(optional, selected(), context).selection.groups).toEqual([]);
    (tree.groups[0] as OptionGroup).options[0].available = false;
    expect(completeAnonymousSelectionV2(tree, selected(), context).issues.length).toBeGreaterThan(0);
    expect(codes(config([group("g", [opt()], { hidePublicLabel: true, highlightInPriceSummary: true })]))).toContain("INVALID_SUMMARY_HIGHLIGHT");
  });
  it("avoids collisions with manual instance IDs when filling anonymous choices", () => {
    const tree = config([group("manual", [opt("manual-o")]), group("forced", [opt("forced-o")], { hidePublicLabel: true, min: 1, max: 1 })]);
    const before = selected([pick("manual", "manual-o", "auto:1")]);
    const done = completeAnonymousSelectionV2(tree, before, context);
    expect(done.issues).toEqual([]);
    expect(validateSelection(tree, done.selection, context)).toEqual([]);
    expect((done.selection.groups[1] as any).instances[0].instanceId).toBe("auto:2");
  });
  it("does not remap an external ORIGINAL source's local price node IDs", () => {
    const tree = linked(source, "ORIGINAL", { o: { price: "5" } });
    let id = 0;
    const copy = cloneCustomConfigurationV2(tree, () => "fresh-" + (++id));
    expect((copy.groups[0] as OptionGroup).options[0].linkedProduct!.originalPriceOverrides).toEqual({ o: { price: "5" } });
  });
  it("rejects invalid linked scope overlays instead of falling back to source prices", () => {
    const tree = linked(source, "ORIGINAL", { o: { price: "4", priceBySize: { sizeGroupId: "foreign", overrides: {} } } });
    expect(calculateMinimumPrice(tree, linkedContext(source)).orderable).toBe(false);
  });
  it("rejects unknown dependency targets and malformed graph inputs", () => {
    expect(validateDependencyGraph([{ productId: "p", catalogId: "tenant", configuration: linked(source, "ORIGINAL") }]).map(i => i.code)).toContain("LINK_TARGET_NOT_FOUND");
    expect(validateDependencyGraph([null as never]).map(i => i.code)).toContain("INVALID_PRODUCT_RECORD");
    expect(() => collectDependencyEdges(null as never)).toThrow();
  });
  it("includes shared branches in identity and freezes Snapshot V2", () => {
    const tree = config([group("g", [opt()], { children: [group("child", [opt("x", "1"), opt("y", "2")])] })]);
    const a = selected([{ ...pick(), children: [pick("child", "x", "cx")] }]);
    const b = selected([{ ...pick(), children: [pick("child", "y", "cy")] }]);
    expect(createSelectionKey(a)).not.toBe(createSelectionKey(b));
    const same = structuredClone(a);
    (same.groups[0] as any).instances[0].instanceId = "changed";
    expect(createSelectionKey(a)).toBe(createSelectionKey(same));
    const result = createConfigurationSnapshot({ configuration: tree, selection: a, context, productName: "P", currency: "SYP", createdAt: "2026-11-13T00:00:00Z" });
    expect(result.snapshot).toMatchObject({ snapshotVersion: 2, total: "11" });
    expect(Object.isFrozen(result.snapshot?.selection)).toBe(true);
  });
});
