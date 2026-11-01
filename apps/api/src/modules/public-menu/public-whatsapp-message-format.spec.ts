import { describe, expect, it } from "vitest";
import { buildNetworkWhatsappDemo } from "../orders/network-order-whatsapp-demo";
import { formatTrustedWhatsappDraft } from "./public-whatsapp-checkout.service";

type Draft = Parameters<typeof formatTrustedWhatsappDraft>[0];

function demoDraft(kind: "pizza" | "combo", locale: "ar" | "en"): Draft {
  const snapshot = buildNetworkWhatsappDemo(kind, locale);
  const item = snapshot.items[0];
  return {
    schemaVersion: 1, restaurantId: "demo-restaurant", restaurantName: locale === "ar" ? "مطعم التجربة" : "Demo restaurant",
    restaurantSlug: "demo", whatsappPhone: "15551234567", currency: snapshot.currency, locale,
    details: { customerName: locale === "ar" ? "زبون تجريبي" : "Demo customer", fulfillmentType: "pickup" },
    items: [{
      mode: "NETWORK", lineId: "line-1", productId: item.productId, productName: item.productName,
      quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal, changed: false,
      configurationRevision: item.configurationRevision, linkedSourceRevisions: item.linkedSourceRevisions,
      display: item as Draft["items"][number]["display"]
    }],
    itemsSubtotal: item.lineTotal, deliveryFee: null, totalAmount: item.lineTotal
  };
}

describe("trusted public WhatsApp message presentation", () => {
  it("shows actual Arabic size, included and nested choices, then exact total", () => {
    const message = formatTrustedWhatsappDraft(demoDraft("pizza", "ar"));
    expect(message).toContain("2 × \u2068بيتزا مارغريتا\u2069 — \u2068كبير\u2069");
    expect(message).not.toContain("1. 2 ×");
    expect(message).toContain("جبنة إضافية");
    expect(message).toContain("صوص حار");
    expect(message).toContain("1 × ⁨جبنة إضافية⁩");
    expect(message).not.toMatch(/جبنة إضافية⁩ × 1 —|مشمول|مجاني|سعر الوحدة/);
    expect(message).not.toMatch(/📏 الأحجام — كبير/);
    expect(message).not.toContain("الحجم:");
    expect(message).not.toContain("Configuration Revision");
    expect(message).not.toMatch(/\(اختياري\)|\(مطلوب\)|أعلى إضافتين مجانًا/);
    expect(message).toContain("الإجمالي: 530.000008 EGP");
    expect(message).toContain("رسوم التوصيل: لا تُضاف للاستلام");
    expect(message.indexOf("بيتزا مارغريتا")).toBeGreaterThan(message.indexOf("━━━━━━━━━━━━━━"));
    expect(message.indexOf("اسم الزبون")).toBeGreaterThan(message.indexOf("مجموع الأصناف"));
    expect(message).not.toContain("الفرع:");
  });

  it("preserves every repeated linked instance and English source choices", () => {
    const message = formatTrustedWhatsappDraft(demoDraft("combo", "en"));
    expect(message).toContain("Family combo");
    expect(message.match(/• 1 × ⁨(?:First pizza|Extra pizza)⁩ — ⁨Source pizza⁩/g)).toHaveLength(3);
    expect(message).toContain("Large");
    expect(message).toContain("Medium");
    expect(message).not.toContain("Component choices");
    expect(message).not.toContain("ORIGINAL");
    expect(message).not.toContain("CUSTOM");
  });

  it("groups identical trusted lines for display without changing their source data", () => {
    const draft = demoDraft("pizza", "ar");
    const first = draft.items[0];
    draft.items.push({ ...first, lineId: "line-2", display: first.display ? { ...first.display } : undefined });
    draft.totalAmount = "1060.000016";
    draft.itemsSubtotal = draft.totalAmount;
    const before = JSON.stringify(draft.items);
    const message = formatTrustedWhatsappDraft(draft);
    expect(message).toContain("4 × \u2068بيتزا مارغريتا\u2069 — \u2068كبير\u2069");
    expect(message).not.toContain("Line total");
    expect(message).toContain("إجمالي الصنف: 1060.000016 EGP");
    expect(message.match(/بيتزا مارغريتا/g)).toHaveLength(1);
    expect(JSON.stringify(draft.items)).toBe(before);
  });

  it("keeps distinct notes and Legacy/Network lines separate in a mixed draft", () => {
    const draft = demoDraft("pizza", "en");
    const first = draft.items[0];
    draft.items.push({ ...first, lineId: "line-2", note: "No onion", display: first.display ? { ...first.display, note: "No onion" } : undefined });
    draft.items.push({ mode: "LEGACY", lineId: "legacy-1", productId: "legacy", productName: "Juice", quantity: 1,
      unitPrice: "10", lineTotal: "10", changed: false });
    draft.totalAmount = "1070.000016";
    draft.itemsSubtotal = draft.totalAmount;
    const message = formatTrustedWhatsappDraft(draft);
    expect(message.match(/Pizza Margherita/g)).toHaveLength(2);
    expect(message).toContain("No onion");
    expect(message).toContain("1 × \u2068Juice\u2069");
    expect(message).not.toContain("3. 1 ×");
    expect(message).toContain("Total: 1070.000016 EGP");
    expect(message).toContain("*🔸️ Item note: ⁨No onion⁩*");
  });

  it("separates bold order notes before totals and keeps customer details after them", () => {
    const draft = demoDraft("pizza", "ar");
    draft.details.orderNote = "الصلصة منفصلة";
    const message = formatTrustedWhatsappDraft(draft);
    expect(message).toContain("*🔸️ ملاحظات الطلب: ⁨الصلصة منفصلة⁩*");
    expect(message.indexOf("ملاحظات الطلب")).toBeLessThan(message.indexOf("مجموع الأصناف"));
    expect(message.indexOf("اسم الزبون")).toBeGreaterThan(message.indexOf("الإجمالي:"));
    expect(message.replace(/[\u2066-\u2069]/g, "")).not.toMatch(/━━━━━━━━━━━━━━\s+━━━━━━━━━━━━━━/);
  });

  it("starts every nonempty Arabic line with a strong RTL mark but leaves English LTR", () => {
    const arabic = demoDraft("combo", "ar");
    arabic.details.orderNote = "طلب طويل Demo ورقم 123";
    const message = formatTrustedWhatsappDraft(arabic);
    expect(message.split("\n").filter(Boolean).every((line) => line.startsWith("\u200f"))).toBe(true);
    expect(message).toContain("طريقة الاستلام: 🍽️ استلام من المطعم");
    expect(message).toContain("*🔸️ ملاحظات الطلب: ⁨طلب طويل Demo ورقم 123⁩*");
    expect(message).not.toContain("\u2067");
    const english = formatTrustedWhatsappDraft(demoDraft("combo", "en"));
    expect(english.startsWith("🧾 New order")).toBe(true);
    expect(english).toContain("Fulfillment: 🍽️ Pickup");
    expect(english).not.toContain("\u200f");
  });

  it("renders delivery wording and pickup time only for their matching fulfillment", () => {
    const pickup = demoDraft("pizza", "ar");
    pickup.details.pickupTime = "18:30";
    expect(formatTrustedWhatsappDraft(pickup)).toContain("🕒 موعد الاستلام: ⁨18:30⁩");
    const delivery = demoDraft("pizza", "ar");
    delivery.details.fulfillmentType = "delivery";
    delivery.details.deliveryArea = "حلب";
    delivery.details.deliveryNear = "الباسل";
    delivery.deliveryFee = null;
    delivery.totalAmount = null;
    const message = formatTrustedWhatsappDraft(delivery);
    expect(message).toContain("طريقة الاستلام: 🛵 توصيل دليفري");
    expect(message).not.toContain("موعد الاستلام:");
  });

  it("rejects an inconsistent trusted line before presentation grouping", () => {
    const draft = demoDraft("pizza", "en");
    draft.items.push({ ...draft.items[0], lineId: "line-2", lineTotal: "1" });
    expect(() => formatTrustedWhatsappDraft(draft)).toThrow(/LINE_MISMATCH/);
  });

  it("distinguishes fixed, free and area-pending delivery without inventing a final total", () => {
    const draft = demoDraft("pizza", "ar");
    draft.details.fulfillmentType = "delivery";
    draft.details.deliveryArea = "منطقة تجريبية";
    draft.details.deliveryNear = "معلم تجريبي";
    draft.deliveryFee = "10";
    draft.totalAmount = "540.000008";
    expect(formatTrustedWhatsappDraft(draft)).toContain("رسوم التوصيل: 10 EGP");
    expect(formatTrustedWhatsappDraft(draft)).toContain("الإجمالي: 540.000008 EGP");
    draft.deliveryFee = "0";
    draft.totalAmount = draft.itemsSubtotal;
    expect(formatTrustedWhatsappDraft(draft)).toContain("رسوم التوصيل: مجاني");
    draft.deliveryFee = null;
    draft.totalAmount = null;
    const pending = formatTrustedWhatsappDraft(draft);
    expect(pending).toContain("رسوم التوصيل: تُحدّد حسب المنطقة");
    expect(pending).toContain("الإجمالي: يُحدّد بعد رسوم التوصيل");
    expect(pending).not.toContain("بجانب:");
  });
});
