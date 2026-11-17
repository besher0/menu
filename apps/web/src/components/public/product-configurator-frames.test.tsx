import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { ConfigurationGroupV2 as ConfigurationGroup, OptionChoiceV2 as OptionChoice, OptionGroupV2 as OptionGroup, ProductConfigurationV2, SizeGroupV2 as SizeGroup } from "@menu/shared";
import type { PublicLinkedConfigurationSource } from "@/lib/api";
import { SelectionGroups } from "./product-configurator";
import { buildInitialSelection } from "./product-configurator-model";

function choice(id: string, props: Partial<OptionChoice> = {}): OptionChoice {
  return { id, label: id, price: "0", maxQuantity: 1, ...props };
}

function group(id: string, options: OptionChoice[], props: Partial<OptionGroup> = {}): OptionGroup {
  return { type: "OPTIONS", id, label: id, options, min: 0, max: 2, includedQuantity: 0, ...props };
}

function tree(productId: string, groups: ConfigurationGroup[]): ProductConfigurationV2 {
  return { schemaVersion: 2, revision: 1, basePrice: "0", productId, groups };
}

function render(groups: ConfigurationGroup[], linked: PublicLinkedConfigurationSource[] = []) {
  const configuration = tree("meal", groups);
  const sources = new Map(linked.map(source => [source.productId, source]));
  let id = 0;
  const createId = () => String(++id);
  const selection = buildInitialSelection(configuration, sources, createId);
  const html = renderToStaticMarkup(<SelectionGroups ancestorHasFrame={false}
    configuration={configuration} selection={selection} sources={sources} currency="SYP" locale="ar"
    showPrices createId={createId} onChange={() => {}} onSelectionProblem={() => {}} />);
  const framedIds = [...html.matchAll(/<(?:section|article)\b[^>]*>/g)]
    .map(([tag]) => tag.includes('data-framed="true"') && tag.match(/data-(?:option|group)-id="([^"]+)"/)?.[1])
    .filter(Boolean);
  return { html, framedIds };
}

const star = { highlightInPriceSummary: true };
const size: SizeGroup = { id: "size", type: "SIZE", label: "choose a size", ...star,
  sizes: [{ id: "small", label: "small", price: "7" }] };
const drink = group("choose a drink", [choice("pepsi", star), choice("7up"), choice("mirinda")], { ...star, min: 1, max: 1 });

it("frames pizza tono and the drink independently across a hidden combo heading", () => {
  const pizza = choice("pizza tono", { ...star, minQuantity: 1, children: [size, group("choose extra", [choice("cheese")])] });
  const { html, framedIds } = render([group("hidden", [pizza], { hidePublicLabel: true }), drink]);
  expect(framedIds).toEqual(["pizza tono", "choose a drink"]);
  expect(html).toContain('data-group-id="size"');
  expect(html).toContain('role="radio"');
});

it.each([true, false, undefined])("resolves three nested stars along one path (outer %s)", outer => {
  const extras = group("extras", [choice("cheese", { ...star, minQuantity: 1, children: [size] })], { highlightInPriceSummary: outer });
  expect(render([extras]).framedIds).toEqual([outer ? "extras" : "cheese"]);
});

it("allows independent sibling frames and retains disabled choices", () => {
  const extras = group("إضافات البرجر", [choice("جبنة"), choice("خس"), choice("لحم إضافي")]);
  const siblings = group("extras", [choice("one", star), choice("two", { ...star, available: false })]);
  const { framedIds, html } = render([extras, drink, siblings]);
  expect(framedIds).toEqual(["choose a drink", "one", "two"]);
  expect(html).toContain('aria-disabled="true"');
});

it.each([true, false])("passes the size group's frame through the selected size (%s)", outer => {
  const parent = { ...size, highlightInPriceSummary: outer, sizes: [size.sizes[0]], children: [drink] };
  expect(render([parent]).framedIds).toEqual([outer ? "size" : "choose a drink"]);
});

it.each(["ORIGINAL", "CUSTOM"] as const)("carries frames across both repeated %s instances", mode => {
  const config = tree("source", [size]);
  const source: PublicLinkedConfigurationSource = { productId: "source", available: true, orderable: true,
    mode: "NETWORK", name: "Source", slug: "source", currency: "SYP", configurationRevision: 1, configuration: config };
  for (const [parentStar, choiceStar, expected] of [
    [true, true, ["meal"]], [false, true, ["piece"]], [false, false, ["size", "size"]]
  ] as const) {
    const piece = choice("piece", { highlightInPriceSummary: choiceStar, minQuantity: 2, maxQuantity: 2,
      linkedProduct: { mode, sourceProductId: "source", ...(mode === "CUSTOM" ? { customConfiguration: config } : {}) } });
    expect(render([group("meal", [piece], { highlightInPriceSummary: parentStar })], [source]).framedIds).toEqual(expected);
  }
});
