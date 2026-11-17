/** DEMO ONLY: explicit fixtures for isolated tests/development. Never seeded into customer restaurants. */
import type { ProductConfigurationV2 as Config, ProductEditorAggregate } from "@menu/shared";
export const demoSourceId = "demo-v62-drink";
export function demoDrink(): Config {
  return { schemaVersion: 2, productId: demoSourceId, revision: 1, basePrice: "50000", groups: [
    { type: "SIZE", id: "demo-drink-sizes", label: "حجم المشروب", highlightInPriceSummary: true,
      sizes: [{ id: "demo-drink-small", label: "صغير", price: "9000" }, { id: "demo-drink-large", label: "كبير", price: "14000" }],
      children: [{ type: "OPTIONS", id: "demo-ice", label: "الثلج", min: 0, max: 1, includedQuantity: 0,
        options: [{ id: "demo-less-ice", label: "ثلج قليل", price: "0", maxQuantity: 1 }] }] }
  ] };
}
export function demoAggregate(configuration = demoDrink()): ProductEditorAggregate {
  return { id: configuration.productId, currency: "SYP", editVersion: 1, configurationVersion: configuration.revision, primaryImageId: null,
    configuration, dependencies: [], advancedMedia: { model3dUrl: "", model3dFormat: "GLB", vrUrl: "" },
    product: { name: "DEMO — مشروب", description: "بيانات اصطناعية للاختبار فقط", categoryId: null,
      basePrice: configuration.basePrice, isNew: false, isFeatured: false, isPopular: false, moodKeys: [], images: [], ingredients: [], mealDetails: [] } };
}
export function demoPizza(id = "demo-v62-pizza"): Config {
  return { schemaVersion: 2, productId: id, revision: 1, basePrice: "5000", groups: [
    { type: "SIZE", id: "demo-pizza-sizes", label: "حجم البيتزا", highlightInPriceSummary: true,
      sizes: [{ id: "demo-small", label: "صغير", price: "11000" }, { id: "demo-medium", label: "وسط", price: "15000" }, { id: "demo-large", label: "كبير", price: "21000" }],
      children: [{ type: "OPTIONS", id: "demo-shared", label: "تحمير مشترك", min: 0, max: 1, includedQuantity: 0,
        options: [{ id: "demo-toast", label: "تحمير إضافي", price: "500", maxQuantity: 1 }] }] },
    { type: "OPTIONS", id: "demo-extras", label: "إضافات البيتزا", min: 0, max: null, includedQuantity: 1, highlightInPriceSummary: true,
      options: [{ id: "demo-cheese", label: "جبنة", price: "1500", maxQuantity: null, highlightInPriceSummary: true,
        priceBySize: { sizeGroupId: "demo-pizza-sizes", overrides: { "demo-small": "750", "demo-medium": null, "demo-large": "0" } },
        children: [{ type: "OPTIONS", id: "demo-cheese-kind", label: "نوع الجبنة", min: 1, max: 1, includedQuantity: 0,
          options: [{ id: "demo-mozzarella", label: "موزاريلا", price: "0", maxQuantity: 1 }] }] },
        { id: "demo-mushroom", label: "فطر", price: "2000", maxQuantity: null }] },
    { type: "OPTIONS", id: "demo-anonymous", label: "خيارات تقنية DEMO", hidePublicLabel: true, min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "demo-tomato", label: "صلصة طماطم", price: "0", maxQuantity: 1, highlightInPriceSummary: true }] }
  ] };
}
export function demoCombo(id = "demo-v62-combo"): Config {
  const custom = demoDrink();
  custom.productId = demoSourceId;
  custom.basePrice = "0";
  return { schemaVersion: 2, productId: id, revision: 1, basePrice: "1000", groups: [
    { type: "OPTIONS", id: "demo-combo", label: "DEMO — مكونات العرض", min: 1, max: 2, includedQuantity: 0, highlightInPriceSummary: true,
      options: [
        { id: "demo-original", label: "مشروب ORIGINAL", price: "0", maxQuantity: 1, linkedProduct: { sourceProductId: demoSourceId, mode: "ORIGINAL",
          originalPriceOverrides: { "demo-drink-small": { price: "1500" }, "demo-drink-large": { price: "2000" } } } },
        { id: "demo-custom", label: "مشروب CUSTOM", price: "0", maxQuantity: 1, linkedProduct: { sourceProductId: demoSourceId, mode: "CUSTOM", customConfiguration: custom },
          children: [{ type: "OPTIONS", id: "demo-private", label: "فرع خاص بالوحدة", min: 0, max: 1, includedQuantity: 0,
            options: [{ id: "demo-lemon", label: "ليمون", price: "250", maxQuantity: 1 }] }] }
      ],
      children: [{ type: "OPTIONS", id: "demo-common", label: "فرع مشترك للعرض", min: 0, max: null, includedQuantity: 1,
        options: [{ id: "demo-gift", label: "إضافة اختيارية", price: "100", maxQuantity: null }] }] }
  ] };
}
