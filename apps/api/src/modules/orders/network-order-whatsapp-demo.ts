import { calculatePrice, multiplyMoney, type ProductConfigurationV1, type ProductSelectionV1 } from "@menu/shared";

type Locale = "ar" | "en";

/** In-memory Stage 6C-shaped snapshots. Never seeds a database or contacts WhatsApp. */
export function buildNetworkWhatsappDemo(kind: "pizza" | "combo", locale: Locale) {
  const ar = locale === "ar";
  const source: ProductConfigurationV1 = {
    schemaVersion: 1, productId: "demo-source", revision: 4, basePrice: null,
    groups: [{ type: "SIZE", id: "source-sizes", label: ar ? "أحجام البيتزا" : "Pizza sizes", sizes: [
      { id: "source-small", label: ar ? "وسط" : "Medium", price: "100" },
      { id: "source-large", label: ar ? "كبير" : "Large", price: "200" }
    ] }]
  };
  const pizza: ProductConfigurationV1 = {
    schemaVersion: 1, productId: "demo-pizza", revision: 3, basePrice: null,
    groups: [
      { type: "SIZE", id: "sizes", label: ar ? "الأحجام" : "Sizes", sizes: [
        { id: "small", label: ar ? "صغير" : "Small", price: "100" },
        { id: "large", label: ar ? "كبير" : "Large", price: "200.000001" }
      ] },
      { type: "OPTIONS", id: "toppings", label: ar ? "الإضافات" : "Toppings", min: 0, max: 5, includedQuantity: 1,
        options: [
          { id: "cheese", label: ar ? "جبنة إضافية" : "Extra cheese", price: "20", maxQuantity: 3,
            priceOverrides: [{ sizeChoiceId: "large", price: "30.000001" }],
            children: [{ type: "OPTIONS", id: "sauces", label: ar ? "الصوصات" : "Sauces", min: 0, max: 1, includedQuantity: 0,
              options: [{ id: "bbq", label: ar ? "صوص حار" : "Hot sauce", price: "5.000001", maxQuantity: 1 }] }] },
          { id: "olives", label: ar ? "زيتون" : "Olives", price: "0", maxQuantity: 2 }
        ] }
    ]
  };
  const combo: ProductConfigurationV1 = {
    schemaVersion: 1, productId: "demo-combo", revision: 2, basePrice: "0",
    groups: [{ type: "OPTIONS", id: "slots", label: ar ? "اختيار البيتزا" : "Choose pizzas", min: 3, max: 3, includedQuantity: 0,
      options: [
        { id: "original", label: ar ? "بيتزا أصلية" : "Original pizza", price: "10", maxQuantity: 2,
          linkedProduct: { sourceProductId: "demo-source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": "5", "source-large": "8" } } },
        { id: "custom", label: ar ? "بيتزا مخصصة" : "Custom pizza", price: "3", maxQuantity: 1,
          linkedProduct: { sourceProductId: "demo-source", mode: "CUSTOM", customConfiguration: {
            schemaVersion: 1, productId: "demo-source", revision: 4, basePrice: null,
            groups: [{ type: "SIZE", id: "custom-sizes", label: ar ? "حجم الكومبو" : "Combo size", sizes: [
              { id: "custom-one", label: ar ? "وسط مخصص" : "Custom medium", price: "7" }
            ] }]
          } } }
      ] }]
  };
  const pizzaSelection: ProductSelectionV1 = {
    schemaVersion: 1, productId: "demo-pizza", configurationRevision: 3, groups: [
      { type: "SIZE", groupId: "sizes", sizeChoiceId: "large" },
      { type: "OPTIONS", groupId: "toppings", instances: [
        { instanceId: "cheese-1", optionId: "cheese", children: [{ type: "OPTIONS", groupId: "sauces", instances: [
          { instanceId: "sauce-1", optionId: "bbq" }
        ] }] },
        { instanceId: "cheese-2", optionId: "cheese" },
        { instanceId: "cheese-3", optionId: "cheese" },
        { instanceId: "olive-1", optionId: "olives" }
      ] }
    ]
  };
  const linkedSelection = (sizeChoiceId: string): ProductSelectionV1 => ({
    schemaVersion: 1, productId: "demo-source", configurationRevision: 4,
    groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId }]
  });
  const comboSelection: ProductSelectionV1 = {
    schemaVersion: 1, productId: "demo-combo", configurationRevision: 2,
    groups: [{ type: "OPTIONS", groupId: "slots", instances: [
      { instanceId: "pizza-1", optionId: "original", linkedSelection: linkedSelection("source-large") },
      { instanceId: "pizza-2", optionId: "original", linkedSelection: linkedSelection("source-small") },
      { instanceId: "pizza-3", optionId: "custom", linkedSelection: { schemaVersion: 1, productId: "demo-source", configurationRevision: 4,
        groups: [{ type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-one" }] } }
    ] }]
  };
  const configuration = kind === "pizza" ? pizza : combo;
  const selection = kind === "pizza" ? pizzaSelection : comboSelection;
  const context = { catalogId: "demo-restaurant", linkedProducts: new Map([[
    "demo-source", { productId: "demo-source", catalogId: "demo-restaurant", configuration: source, available: true, orderable: true }
  ]]) };
  const result = calculatePrice(configuration, selection, context);
  if (!result.valid || result.total === null) throw new Error(`Invalid demo fixture: ${JSON.stringify(result.issues)}`);
  const quantity = kind === "pizza" ? 2 : 1;
  const item = {
    snapshotVersion: 1, mode: "NETWORK", locale, currency: "EGP", productId: configuration.productId,
    productSlug: kind, productName: kind === "pizza" ? (ar ? "بيتزا مارغريتا" : "Pizza Margherita") : (ar ? "كومبو عائلي" : "Family combo"),
    quantity, configurationRevision: configuration.revision, canonicalSelection: selection,
    selectionKey: "demo-only", linkedSourceRevisions: kind === "combo" ? [{ sourceProductId: "demo-source", mode: "NETWORK", configurationRevision: 4 }] : [],
    unitPrice: result.total, lineTotal: multiplyMoney(result.total, quantity), priceBreakdown: result.lines,
    baseIgnored: result.baseIgnored, configurationTree: configuration,
    linkedSources: kind === "combo" ? [{ productId: "demo-source", productName: ar ? "بيتزا المصدر" : "Source pizza",
      mode: "NETWORK", configurationRevision: 4, configurationTree: source }] : [],
    createdAt: "2026-10-13T00:00:00.000Z"
  };
  return { snapshotVersion: 1, mode: "NETWORK", locale, currency: "EGP", totalAmount: item.lineTotal,
    items: [item], createdAt: "2026-10-13T00:00:00.000Z" };
}
