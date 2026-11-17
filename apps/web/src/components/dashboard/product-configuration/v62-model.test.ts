import { describe, it, expect } from "vitest";
import { calculateMinimumPriceV2, completeAnonymousSelectionV2, cloneCustomConfigurationV2, validateConfigurationV2, type ProductConfigurationV2 as Config } from "@menu/shared";
import { attachLinked, copy, createGroup, createSize, createOption, deleteNode, emptyConfiguration, hasSizes, insertGroup, issueNode,
  locate, moveNode, originalTree, pricingContext, shouldFrame, updateNode } from "./v62-model";
import { demoAggregate, demoCombo, demoDrink, demoPizza } from "./v62-fixtures";
import { buildSelectionV2 } from "./v62-preview";

describe("V62 editor / canonical V2 draft transformations", () => {
  const sources = new Map([[demoDrink().productId, demoAggregate()]]);
  it("creates blank Size name/price without converting blanks into zero", () => {
    const size = createSize(); expect(size.label).toBe(""); expect(size.price).toBe("");
    expect(createGroup("SIZE").type).toBe("SIZE");
    expect(createOption().maxQuantity).toBeNull();
  });
  it("keeps explicit zero distinct from a blank price", () => {
    const c = demoPizza(); c.groups[0].type === "SIZE" && (c.groups[0].sizes[0].price = "");
    expect(validateConfigurationV2(c).some(x => /MONEY/.test(x.code))).toBe(true);
    c.groups[0].type === "SIZE" && (c.groups[0].sizes[0].price = "0");
    expect(validateConfigurationV2(c)).toEqual([]);
  });
  it("edits A and B in the same draft without an inspector save", () => {
    const first = updateNode(demoPizza(), { id: "demo-cheese", path: [] }, n => { n.label = "Updated cheese"; });
    const second = updateNode(first, { id: "demo-mushroom", path: [] }, n => { n.label = "Updated mushroom"; });
    expect(locate(second, { id: "demo-cheese", path: [] })?.node.label).toBe("Updated cheese");
    expect(locate(second, { id: "demo-mushroom", path: [] })?.node.label).toBe("Updated mushroom");
  });
  it("resolves eligible sibling size groups using Shared, and isolates independent branches", () => {
    const c = demoPizza();
    expect(locate(c, { id: "demo-cheese", path: [] })?.scopes.map(x => x.id)).toEqual(["demo-pizza-sizes"]);
    expect(locate(c, { id: "demo-mozzarella", path: [] })?.scopes).toEqual([]);
    expect(locate(c, { id: "demo-toast", path: [] })?.scopes.map(x => x.id)).toEqual(["demo-pizza-sizes"]);
  });
  it("uses Group.children for sizes and private branches only for options", () => {
    const c = demoPizza();
    expect(locate(c, { id: "demo-toast", path: [] })?.level).toBe(2);
    expect(locate(c, { id: "demo-mozzarella", path: [] })?.level).toBe(2);
    if (c.groups[0].type === "SIZE") expect(c.groups[0].sizes.every(x => !("children" in x))).toBe(true);
  });
  it("reorders siblings without changing stable identities or the original draft", () => {
    const c = demoPizza(), before = copy(c);
    const next = moveNode(c, { id: "demo-small", path: [] }, { path: [], container: "choices:demo-pizza-sizes", index: 3 }, sources);
    expect(next.groups[0].type === "SIZE" && next.groups[0].sizes.map(x => x.id)).toEqual(["demo-medium", "demo-large", "demo-small"]);
    expect(c).toEqual(before);
  });
  it("moves an options group into a shared allowed container", () => {
    const c = demoPizza(); c.groups.push({ type: "OPTIONS", id: "move-group", label: "Move", min: 0, max: 1, includedQuantity: 0,
      options: [{ id: "move-option", label: "Move option", price: "0", maxQuantity: 1 }] });
    const next = moveNode(c, { id: "move-group", path: [] }, { path: [], container: "children:demo-pizza-sizes", index: 1 }, sources);
    expect(locate(next, { id: "move-option", path: [] })?.level).toBe(2);
  });
  it("rejects cycles, wrong containers and sizes dropped into option lists", () => {
    const c = demoPizza();
    expect(() => moveNode(c, { id: "demo-extras", path: [] }, { path: [], container: "children:demo-cheese", index: 0 }, sources)).toThrow();
    expect(() => moveNode(c, { id: "demo-small", path: [] }, { path: [], container: "choices:demo-extras", index: 0 }, sources)).toThrow();
    expect(() => moveNode(c, { id: "demo-cheese", path: [] }, { path: [], container: "root", index: 0 }, sources)).toThrow();
  });
  it("rejects scope-breaking moves rather than rewriting price scope silently", () => {
    expect(() => moveNode(demoPizza(), { id: "demo-cheese", path: [] }, { path: [], container: "choices:demo-cheese-kind", index: 0 }, sources)).toThrow();
  });
  it("rejects a fourth group level", () => {
    const c = demoPizza();
    let next = insertGroup(c, { path: [], container: "children:demo-mozzarella", index: 0 }, "OPTIONS");
    next.configuration = updateNode(next.configuration, { id: next.ref.id, path: [] }, n => { n.label = "Third"; });
    const third = locate(next.configuration, next.ref)!;
    expect(third.level).toBe(3);
    const fourth = insertGroup(next.configuration, { path: [], container: "children:" + next.ref.id, index: 0 }, "OPTIONS");
    expect(() => moveNode(fourth.configuration, { id: "demo-anonymous", path: [] }, { path: [], container: "children:" + fourth.ref.id, index: 0 }, sources)).toThrow();
  });
  it("removes only deleted-size overrides and retains null/zero for remaining sizes", () => {
    const next = deleteNode(demoPizza(), { id: "demo-small", path: [] });
    const option = locate(next, { id: "demo-cheese", path: [] })!.node;
    expect("maxQuantity" in option && option.priceBySize?.overrides).toEqual({ "demo-medium": null, "demo-large": "0" });
    expect(validateConfigurationV2(next)).toEqual([]);
  });
  it("removes the deleted size-group scope and restores Base editability", () => {
    let c = deleteNode(demoPizza(), { id: "demo-pizza-sizes", path: [] });
    expect(hasSizes(c, new Map())).toBe(false); expect(c.basePrice).toBe("5000");
    const option = locate(c, { id: "demo-cheese", path: [] })!.node;
    expect("priceBySize" in option).toBe(false);
  });
  it("rejects deleting the last size with a clear actionable reason", () => {
    let c = deleteNode(demoPizza(), { id: "demo-small", path: [] });
    c = deleteNode(c, { id: "demo-medium", path: [] });
    expect(() => deleteNode(c, { id: "demo-large", path: [] })).toThrow(/الأخير/);
  });
  it("copies CUSTOM through Shared and remaps IDs/scopes without mutating source", () => {
    const c = demoPizza(), source = demoAggregate(demoPizza("source-pizza"));
    const before = copy(source);
    const linked = attachLinked(c, { id: "demo-mushroom", path: [] }, source, "CUSTOM");
    const node = locate(linked, { id: "demo-mushroom", path: [] })!.node;
    const custom = "maxQuantity" in node ? node.linkedProduct?.customConfiguration : undefined;
    expect(custom?.basePrice).toBe("0"); expect(custom?.groups[0].id).not.toBe(source.configuration!.groups[0].id);
    expect(validateConfigurationV2(custom!)).toEqual([]); expect(source).toEqual(before);
    const choice = custom!.groups[0].type === "SIZE" ? custom!.groups[0].sizes[0] : undefined;
    const edited = updateNode(linked, { id: choice!.id, path: ["demo-mushroom"] }, n => { n.label = "Local"; });
    expect(locate(edited, { id: choice!.id, path: ["demo-mushroom"] })?.node.label).toBe("Local");
    expect(source).toEqual(before);
  });
  it("ORIGINAL uses live structure with local prices, never standalone source Base", () => {
    const c = demoCombo();
    const tree = originalTree(c, { id: "demo-original", path: [] }, sources, "catalog", "SYP")!;
    expect(tree.basePrice).toBe("0");
    expect(tree.groups[0].type === "SIZE" && tree.groups[0].sizes.map(x => x.price)).toEqual(["1500", "2000"]);
    expect(demoDrink().basePrice).toBe("50000");
  });
  it("does not cross CUSTOM product domains during drag-and-drop", () => {
    expect(() => moveNode(demoCombo(), { id: "demo-drink-small", path: ["demo-custom"] }, { path: [], container: "root", index: 0 }, sources)).toThrow(/Linked/);
  });
  it("rejects self and foreign-cycle source relationships and ordinary ORIGINAL", () => {
    const c = demoPizza(), self = demoAggregate(c), ordinary = { ...demoAggregate(), configuration: null };
    expect(() => attachLinked(c, { id: "demo-mushroom", path: [] }, self, "CUSTOM")).toThrow(/دورة/);
    expect(() => attachLinked(c, { id: "demo-mushroom", path: [] }, ordinary, "ORIGINAL")).toThrow(/ORIGINAL/);
  });
  it("completes only a forced anonymous single option and keeps optional groups unselected", () => {
    const c = demoPizza(), context = pricingContext("catalog", "SYP", sources);
    const selected = completeAnonymousSelectionV2(c, buildSelectionV2(c), context).selection;
    const anon = selected.groups.find(x => x.groupId === "demo-anonymous");
    const optional = selected.groups.find(x => x.groupId === "demo-extras");
    expect(anon?.type === "OPTIONS" && anon.instances.map(x => x.optionId)).toEqual(["demo-tomato"]);
    expect(optional?.type === "OPTIONS" && optional.instances.length).toBe(0);
  });
  it("keeps internal stars but suppresses nested frames, including hidden headings", () => {
    expect(shouldFrame({ label: "Parent", highlightInPriceSummary: true }, false)).toBe(true);
    expect(shouldFrame({ label: "Child", highlightInPriceSummary: true }, true)).toBe(false);
    expect(shouldFrame({ label: "Hidden", hidePublicLabel: true, highlightInPriceSummary: true }, false)).toBe(false);
    expect(shouldFrame({ label: "Sibling", highlightInPriceSummary: true }, false)).toBe(true);
  });
  it("matches Shared's Base-ignore result for local and linked sizes without erasing Base", () => {
    for (const config of [demoPizza(), demoCombo()]) {
      expect(hasSizes(config, sources)).toBe(calculateMinimumPriceV2(config, pricingContext("catalog", "SYP", sources)).baseIgnored);
      expect(config.basePrice).not.toBeNull();
    }
  });
  it("maps structured validation paths to the editable size or option", () => {
    expect(issueNode(demoPizza(), "$configuration.groups[0].choices[0].price")?.id).toBe("demo-small");
    expect(issueNode(demoPizza(), "$configuration.groups[1].choices[0].priceBySize")?.id).toBe("demo-cheese");
  });
  it("provides valid DEMO pizza/combo configurations with no automatic persistence", () => {
    expect(validateConfigurationV2(demoPizza())).toEqual([]);
    expect(validateConfigurationV2(demoCombo())).toEqual([]);
    expect(emptyConfiguration("new", null).schemaVersion).toBe(2);
  });
});
