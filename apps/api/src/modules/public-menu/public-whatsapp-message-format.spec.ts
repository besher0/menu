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
    totalAmount: item.lineTotal
  };
}

describe("trusted public WhatsApp message presentation", () => {
  it("shows actual Arabic size, included and nested choices, then exact total", () => {
    const message = formatTrustedWhatsappDraft(demoDraft("pizza", "ar"));
    expect(message).toContain("2 × \u2068بيتزا مارغريتا\u2069 — \u2068كبير\u2069");
    expect(message).toContain("جبنة إضافية");
    expect(message).toContain("صوص حار");
    expect(message).toContain("جبنة إضافية⁩ × 1 — 0 EGP");
    expect(message).not.toMatch(/📏 الأحجام — كبير/);
    expect(message).not.toContain("الحجم:");
    expect(message).not.toContain("Configuration Revision");
    expect(message).toContain("إجمالي الطلب: 530.000008 EGP");
  });

  it("preserves every repeated linked instance and English source choices", () => {
    const message = formatTrustedWhatsappDraft(demoDraft("combo", "en"));
    expect(message).toContain("Family combo");
    expect(message.match(/↳ \u2068Source pizza\u2069/g)).toHaveLength(3);
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
    const message = formatTrustedWhatsappDraft(draft);
    expect(message.match(/Pizza Margherita/g)).toHaveLength(2);
    expect(message).toContain("No onion");
    expect(message).toContain("1 × \u2068Juice\u2069");
    expect(message).toContain("Order total: 1070.000016 EGP");
  });

  it("rejects an inconsistent trusted line before presentation grouping", () => {
    const draft = demoDraft("pizza", "en");
    draft.items.push({ ...draft.items[0], lineId: "line-2", lineTotal: "1" });
    expect(() => formatTrustedWhatsappDraft(draft)).toThrow(/LINE_MISMATCH/);
  });
});
