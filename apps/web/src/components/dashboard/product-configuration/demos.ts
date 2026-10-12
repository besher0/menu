import type { ProductConfigurationV1 } from "@menu/shared";
import type { ProductCandidate, ProductConfigurationEnvelope } from "./types";
import { cloneConfiguration } from "./editor-model";

export type DemoLinkedSource = {
  product: ProductCandidate;
  envelope: ProductConfigurationEnvelope;
};

export function pizzaMargheritaDemo(productId: string, revision: number): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice: null,
    groups: [{
      type: "SIZE",
      id: "demo-pizza-sizes",
      label: "حجم البيتزا",
      sizes: [
        { id: "demo-size-small", label: "صغير", price: "80", children: nestedPizzaOptions("small") },
        { id: "demo-size-medium", label: "وسط", price: "110", children: nestedPizzaOptions("medium") },
        { id: "demo-size-large", label: "كبير", price: "145", children: nestedPizzaOptions("large") }
      ]
    }]
  };
}

function nestedPizzaOptions(suffix: string) {
  return [{
    type: "OPTIONS" as const,
    id: `demo-pizza-toppings-${suffix}`,
    label: "الإضافات",
    min: 0,
    max: 4,
    includedQuantity: 0,
    options: [{
      id: `demo-extra-cheese-${suffix}`,
      label: "جبنة إضافية",
      price: "15",
      maxQuantity: 2,
      priceOverrides: [
        { sizeChoiceId: "demo-size-small", price: "10" },
        { sizeChoiceId: "demo-size-medium", price: "15" },
        { sizeChoiceId: "demo-size-large", price: "22.5" }
      ],
      children: [{
        type: "OPTIONS" as const,
        id: `demo-cheese-finish-${suffix}`,
        label: "تعديل الجبنة",
        min: 0,
        max: 1,
        includedQuantity: 0,
        options: [
          { id: `demo-cheese-baked-${suffix}`, label: "تحمير إضافي", price: "5", maxQuantity: 1 },
          { id: `demo-cheese-herbs-${suffix}`, label: "أعشاب", price: "3", maxQuantity: 1 }
        ]
      }]
    }, {
      id: `demo-olives-${suffix}`,
      label: "زيتون",
      price: "8",
      maxQuantity: 2
    }]
  }, {
    type: "OPTIONS" as const,
    id: `demo-pizza-sauces-${suffix}`,
    label: "الصوصات",
    min: 0,
    max: 3,
    includedQuantity: 0,
    options: [
      { id: `demo-bbq-${suffix}`, label: "باربكيو", price: "6", maxQuantity: 3 },
      { id: `demo-ranch-${suffix}`, label: "رانش", price: "7", maxQuantity: 3 }
    ]
  }];
}

export function includedQuantityDemo(productId: string, revision: number): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice: "100",
    groups: [{
      type: "OPTIONS",
      id: "demo-included-toppings",
      label: "اختر إضافاتك (أعلى إضافتين مجانًا)",
      min: 2,
      max: 5,
      includedQuantity: 2,
      options: [
        { id: "demo-included-mushroom", label: "مشروم", price: "30", maxQuantity: 3 },
        { id: "demo-included-cheese", label: "جبنة", price: "15", maxQuantity: 3 },
        { id: "demo-included-meat", label: "لحم", price: "50", maxQuantity: 3 }
      ]
    }]
  };
}

export function sizeSpecificPricingDemo(productId: string, revision: number): ProductConfigurationV1 {
  return pizzaMargheritaDemo(productId, revision);
}

function explicitCustomSnapshot(source: DemoLinkedSource): ProductConfigurationV1 {
  if (source.envelope.configurationTree) return cloneConfiguration(source.envelope.configurationTree);
  return {
    schemaVersion: 1,
    productId: source.product.id,
    revision: source.envelope.configurationVersion,
    basePrice: source.envelope.basePrice,
    groups: []
  };
}

export function comboDemo(
  productId: string,
  revision: number,
  originalSource: DemoLinkedSource,
  customSource: DemoLinkedSource
): ProductConfigurationV1 {
  if (!originalSource.envelope.configurationTree || originalSource.envelope.mode !== "NETWORK") {
    throw new Error("مثال ORIGINAL يحتاج منتج مصدر محفوظ بنظام Network.");
  }
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice: "0",
    groups: [{
      type: "OPTIONS",
      id: "demo-combo-slots",
      label: "مكونات الكومبو المطلوبة",
      min: 3,
      max: 3,
      includedQuantity: 0,
      options: [{
        id: "demo-combo-pizza-1",
        label: `البيتزا الأولى — ${originalSource.product.name}`,
        price: "100",
        minQuantity: 1,
        maxQuantity: 1,
        linkedProduct: {
          sourceProductId: originalSource.product.id,
          mode: "ORIGINAL",
          originalPriceOverrides: {}
        }
      }, {
        id: "demo-combo-pizza-2",
        label: `البيتزا الثانية — ${originalSource.product.name}`,
        price: "100",
        minQuantity: 1,
        maxQuantity: 1,
        linkedProduct: {
          sourceProductId: originalSource.product.id,
          mode: "ORIGINAL",
          originalPriceOverrides: {}
        }
      }, {
        id: "demo-combo-custom",
        label: `اختيار مخصص — ${customSource.product.name}`,
        price: "40",
        minQuantity: 1,
        maxQuantity: 1,
        linkedProduct: {
          sourceProductId: customSource.product.id,
          mode: "CUSTOM",
          customConfiguration: explicitCustomSnapshot(customSource)
        }
      }]
    }]
  };
}
