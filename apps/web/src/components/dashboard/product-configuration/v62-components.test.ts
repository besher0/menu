import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ConfigurationTree } from "./v62-tree";
import { Inspector } from "./v62-inspector";
import { ConfigurationPreviewV2 } from "./v62-preview";
import { demoAggregate, demoCombo, demoDrink, demoPizza } from "./v62-fixtures";
const sources = new Map([[demoDrink().productId, demoAggregate()]]);
const html = (element: React.ReactElement) => renderToStaticMarkup(element);
const actions = { onSelect() {}, onAdd() {}, onChoice() {}, onDelete() {}, onStar() {}, onMove() {} };
describe("Native V62 components", () => {
  it("renders hierarchy connectors, stable identities, shared/private branches and accessible controls", () => {
    const markup = html(React.createElement(ConfigurationTree, { configuration: demoPizza(), sources, selected: null, readOnly: false,
      actions, restaurantId: "catalog", currency: "SYP", onError() {} }));
    expect(markup).toContain("config-node-card kind-size");
    expect(markup).toContain("config-options-list");
    expect(markup).toContain("تحمير مشترك"); expect(markup).toContain("نوع الجبنة");
    expect(markup).toContain('aria-expanded="true"'); expect(markup).not.toContain("data-v62-drop="); expect(markup).toContain("Alt مع الأسهم");
    expect(markup).not.toContain("iframe"); expect(markup).not.toContain('draggable="true"');
  });
  it("renders nullable max and explicit size scope without a competing save action", () => {
    const markup = html(React.createElement(Inspector, { configuration: demoPizza(), selected: { id: "demo-cheese", path: [] },
      sources, candidates: [], restaurantId: "catalog", currency: "SYP", readOnly: false, onChange() {}, onClose() {}, async onLink() {} }));
    expect(markup).toContain("بدون حد"); expect(markup).toContain("طريقة التسعير");
    expect(markup).toContain('value="750"'); expect(markup).toContain('value="0"');
    expect(markup).not.toContain("حفظ"); expect(markup).not.toContain("السعرات");
  });
  it("shows ORIGINAL source fields read-only and only permits local prices", () => {
    const markup = html(React.createElement(Inspector, { configuration: demoCombo(),
      selected: { id: "demo-drink-small", path: [], original: { owner: "demo-original", source: demoDrink().productId } },
      sources, candidates: [], restaurantId: "catalog", currency: "SYP", readOnly: false, onChange() {}, onClose() {}, async onLink() {} }));
    expect(markup).toContain("ORIGINAL"); expect(markup).toContain('value="1500"');
    expect(markup).toMatch(/اسم الحجم[\s\S]*?disabled/);
    expect(markup).not.toContain("حذف");
  });
  it("never exposes editable CUSTOM controls nested inside an ORIGINAL source", () => {
    const source = demoCombo("nested-source"), parent = demoCombo("parent");
    if (parent.groups[0].type === "OPTIONS") parent.groups[0].options = [{ id: "outer-original", label: "Outer", price: "0", maxQuantity: 1,
      linkedProduct: { mode: "ORIGINAL", sourceProductId: source.productId } }];
    const catalog = new Map([...sources, [source.productId, demoAggregate(source)] as const]);
    const tree = html(React.createElement(ConfigurationTree, { configuration: parent, sources: catalog, selected: null, readOnly: false,
      actions, restaurantId: "catalog", currency: "SYP", onError() {} }));
    expect(tree).toContain("حجم المشروب");
    expect(tree).not.toContain("+ مجموعة محلية");
    const drawer = html(React.createElement(Inspector, { configuration: parent,
      selected: { id: "demo-drink-small", path: [], original: { owner: "outer-original", source: source.productId, linkedPath: ["demo-custom"] } },
      sources: catalog, candidates: [], restaurantId: "catalog", currency: "SYP", readOnly: false, onChange() {}, onClose() {}, async onLink() {} }));
    expect(drawer).toContain("لا يعبر إلى منتج مستقل"); expect(drawer).toMatch(/<fieldset disabled/);
    expect(drawer).toContain('value="9000"');
  });
  it("hides anonymous group stars but keeps option highlighting", () => {
    const markup = html(React.createElement(Inspector, { configuration: demoPizza(), selected: { id: "demo-anonymous", path: [] },
      sources, candidates: [], restaurantId: "catalog", currency: "SYP", readOnly: false, onChange() {}, onClose() {}, async onLink() {} }));
    expect(markup).toContain("العنوان التقني مخفي");
    expect(markup).toMatch(/checkbox[^>]*disabled/);
  });
  it("uses Shared V2 in the retained admin preview and does not add cart simulation", () => {
    const markup = html(React.createElement(ConfigurationPreviewV2, { configuration: demoPizza(), sources, currency: "SYP", restaurantId: "catalog" }));
    expect(markup).toContain("11000"); expect(markup).toContain("معاينة إدارية");
    expect(markup).not.toContain("إضافة إلى السلة"); expect(markup).not.toMatch(/<button[^>]*>[^<]*حفظ/);
  });
  it("does not invent a price for an incomplete configuration", () => {
    const config = demoPizza(); if (config.groups[0].type === "SIZE") config.groups[0].sizes[0].price = "";
    const markup = html(React.createElement(ConfigurationPreviewV2, { configuration: config, sources, currency: "SYP", restaurantId: "catalog" }));
    expect(markup).toContain("لا يُعرض سعر تخميني"); expect(markup).not.toContain("السعر من المحرك المشترك");
  });
});
