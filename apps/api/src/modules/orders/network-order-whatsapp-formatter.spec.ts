import { describe, expect, it } from "vitest";
import { multiplyMoney, sumMoney } from "@menu/shared";
import { buildNetworkWhatsappDemo } from "./network-order-whatsapp-demo";
import { buildNetworkWhatsappPreviewUrl, formatNetworkOrderWhatsappMessage, NetworkOrderSnapshotFormatError } from "./network-order-whatsapp-formatter";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("Stage 6D.1 immutable-snapshot WhatsApp formatter", () => {
  it("renders customer, delivery, address and notes from the saved Arabic snapshot", () => {
    const snapshot = copy(buildNetworkWhatsappDemo("pizza", "ar")) as any;
    snapshot.items[0].note = "بدون بصل";
    const message = formatNetworkOrderWhatsappMessage(snapshot);
    expect(message).toContain("زبون تجريبي");
    expect(message).toContain("حي التجربة");
    expect(message).toContain("يرجى فصل الصوص");
    expect(message).toContain("بدون بصل");
    expect(message).not.toContain("demo-pizza");
  });

  it("renders English pickup and accepts older snapshots with no orderDetails", () => {
    const pickup = buildNetworkWhatsappDemo("combo", "en");
    expect(formatNetworkOrderWhatsappMessage(pickup)).toContain("Pickup time: \u20686 PM\u2069");
    const old = copy(pickup) as any;
    delete old.orderDetails;
    expect(formatNetworkOrderWhatsappMessage(old)).toContain("Order total:");
    expect(formatNetworkOrderWhatsappMessage(old)).not.toContain("Customer:");
  });

  it("rejects malformed saved details rather than inventing or truncating them", () => {
    const malformed = copy(buildNetworkWhatsappDemo("pizza", "en")) as any;
    malformed.orderDetails.fulfillmentType = "drone";
    expect(() => formatNetworkOrderWhatsappMessage(malformed)).toThrow(/INVALID_SNAPSHOT_FULFILLMENT/);
    malformed.orderDetails.fulfillmentType = "delivery";
    malformed.orderDetails.customerName = "A".repeat(201);
    expect(() => formatNetworkOrderWhatsappMessage(malformed)).toThrow(/INVALID_SNAPSHOT_DISPLAY_TEXT/);
    malformed.orderDetails.customerName = "Demo";
    delete malformed.orderDetails.deliveryNear;
    expect(() => formatNetworkOrderWhatsappMessage(malformed)).toThrow(/INVALID_SNAPSHOT_FULFILLMENT/);
  });
  it("renders Arabic Pizza size, nested sauce, included highest-priced cheese, quantity, free option and six decimals", () => {
    const message = formatNetworkOrderWhatsappMessage(buildNetworkWhatsappDemo("pizza", "ar"));
    expect(message).toContain("بيتزا مارغريتا");
    expect(message).toContain("2 × \u2068بيتزا مارغريتا\u2069 — \u2068كبير\u2069");
    expect(message).not.toContain("الحجم:");
    expect(message).toContain("1 × ⁨جبنة إضافية⁩");
    expect(message).toContain("2 × ⁨جبنة إضافية⁩");
    expect(message).toContain("صوص حار");
    expect(message).toContain("1 × ⁨زيتون⁩");
    expect(message).not.toMatch(/جبنة إضافية⁩ × \d+ —|زيتون⁩ × \d+ —|سعر الوحدة|مشمول|مجاني/);
    expect(message).not.toMatch(/📏 الأحجام — كبير/);
    expect(message).not.toMatch(/مشمول|مجاني/);
    expect(message).toContain("إجمالي الصنف: 530.000008 EGP");
    expect(message).toContain("إجمالي الطلب: 530.000008 EGP");
    expect(message.indexOf("الصوصات")).toBeGreaterThan(message.indexOf("جبنة إضافية"));
  });

  it("validates the stored size-specific charge while omitting individual option prices", () => {
    const snapshot = buildNetworkWhatsappDemo("pizza", "en");
    expect((snapshot.items[0].configurationTree.groups[1] as any).options[0].price).toBe("20");
    const message = formatNetworkOrderWhatsappMessage(snapshot);
    expect(message).toContain("Line total: 530.000008 EGP");
    expect(message).not.toContain("30.000001 EGP each");
  });

  it("renders English LTR labels and exact persisted amounts", () => {
    const message = formatNetworkOrderWhatsappMessage(buildNetworkWhatsappDemo("pizza", "en"));
    expect(message).toContain("Pizza Margherita");
    expect(message).toMatch(/Toppings.*\(optional\)/);
    expect(message).toContain("Extra cheese");
    expect(message).toContain("Line total: 530.000008 EGP");
  });

  it("keeps ORIGINAL and CUSTOM instances, repeated source identity, and independent sizes in a required Combo", () => {
    const message = formatNetworkOrderWhatsappMessage(buildNetworkWhatsappDemo("combo", "ar"));
    expect(message).toContain("كومبو عائلي");
    expect(message).toContain("(مطلوب)");
    expect(message).toContain("↳ \u2068بيتزا المصدر\u2069");
    expect(message).not.toContain("ORIGINAL");
    expect(message).not.toContain("CUSTOM");
    expect(message).toContain("كبير");
    expect(message).toContain("وسط");
    expect(message).toContain("43 EGP");
    expect(message.match(/↳ \u2068بيتزا المصدر\u2069/g)).toHaveLength(3);
    expect(message).not.toContain("اختيارات المكوّن");
  });

  it("renders combo options in historical menu order even when instance IDs sort oppositely", () => {
    const snapshot = copy(buildNetworkWhatsappDemo("combo", "ar")) as any;
    const item = snapshot.items[0];
    const instances = item.canonicalSelection.groups[0].instances;
    instances[0].instanceId = "z-first";
    instances[1].instanceId = "z-second";
    instances[2].instanceId = "a-custom";
    for (const line of item.priceBreakdown) {
      line.path = line.path.replace("pizza-1", "z-first").replace("pizza-2", "z-second").replace("pizza-3", "a-custom");
    }
    instances.sort((a: any, b: any) => a.instanceId.localeCompare(b.instanceId));
    const beforeTotal = item.lineTotal;
    const message = formatNetworkOrderWhatsappMessage(snapshot);
    expect(message.indexOf("بيتزا أولى")).toBeLessThan(message.indexOf("بيتزا إضافية"));
    expect(message.match(/↳ ⁨بيتزا المصدر⁩/g)).toHaveLength(3);
    expect(item.lineTotal).toBe(beforeTotal);
    expect(snapshot.totalAmount).toBe(beforeTotal);
  });

  it("formats integer SYP without fractions and keeps repeated linked selections distinct", () => {
    const snapshot = copy(buildNetworkWhatsappDemo("combo", "ar")) as any;
    snapshot.currency = "SYP";
    snapshot.items[0].currency = "SYP";
    const message = formatNetworkOrderWhatsappMessage(snapshot);
    expect(message).toContain("إجمالي الطلب: 43 SYP");
    expect(message.match(/↳ ⁨بيتزا المصدر⁩/g)).toHaveLength(3);
    expect(message).not.toMatch(/مشمول|مجاني|\.00 SYP/);
  });

  it("keeps a zero-priced linked size visible without a misleading individual price", () => {
    const snapshot = copy(buildNetworkWhatsappDemo("combo", "ar")) as any;
    const item = snapshot.items[0];
    const size = item.priceBreakdown.find((line: any) => line.kind === "SIZE" && line.path.includes(".linked"));
    expect(size).toBeDefined();
    size.amount = "0";
    size.chargedAmount = "0";
    item.unitPrice = sumMoney(item.priceBreakdown.map((line: any) => line.chargedAmount));
    item.lineTotal = item.unitPrice;
    snapshot.totalAmount = item.unitPrice;
    const message = formatNetworkOrderWhatsappMessage(snapshot);
    expect(message).toContain("📏 ⁨أحجام البيتزا⁩ — ⁨كبير⁩");
    expect(message).not.toContain("0 EGP");
    expect(message).not.toMatch(/📏.*مجاني/);
    expect(message).toContain(`إجمالي الطلب: ${item.unitPrice} EGP`);
  });

  it("formats historical source and option names without any current Product lookup", () => {
    const old = buildNetworkWhatsappDemo("combo", "en");
    const saved = copy(old);
    const currentProduct = { name: "Renamed live product", price: "9999" };
    const message = formatNetworkOrderWhatsappMessage(saved);
    expect(message).toContain("Source pizza");
    expect(message).toContain("First pizza");
    expect(message).not.toContain(currentProduct.name);
    expect(message).not.toContain(currentProduct.price);
  });

  it("uses an unusual merchant size name directly without an invented Size prefix", () => {
    const snapshot = copy(buildNetworkWhatsappDemo("pizza", "ar")) as any;
    snapshot.items[0].configurationTree.groups[0].sizes[1].label = "بغل";
    const message = formatNetworkOrderWhatsappMessage(snapshot);
    expect(message).toContain("2 × \u2068بيتزا مارغريتا\u2069 — \u2068بغل\u2069");
    expect(message).not.toContain("حجم بغل");
  });

  it("keeps mixed Arabic/English, emoji and characters but flattens injected newlines and formatting", () => {
    const snapshot = copy(buildNetworkWhatsappDemo("pizza", "ar"));
    snapshot.items[0].productName = "بيتزا Pizza 🍕\n💵 إجمالي مزيف *تحذير*";
    (snapshot.items[0].configurationTree.groups[1] as any).options[0].label = "Extra_جبنة\r\nسطر مزيف";
    const message = formatNetworkOrderWhatsappMessage(snapshot);
    expect(message).toContain("بيتزا Pizza 🍕 💵 إجمالي مزيف ＊تحذير＊");
    expect(message).toContain("Extra＿جبنة سطر مزيف");
    expect(message.match(/💵 إجمالي مزيف/g)).toHaveLength(1);
    expect(message.split("\n").filter((line) => line.startsWith("💵"))).toHaveLength(1);
  });

  it("encodes newline, Arabic, English and emoji in a preview link without sending", () => {
    const message = formatNetworkOrderWhatsappMessage(buildNetworkWhatsappDemo("pizza", "ar"));
    const url = buildNetworkWhatsappPreviewUrl("15551234567", message);
    expect(url.startsWith("https://wa.me/15551234567?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(message);
    expect(url).toContain("%0A");
  });

  it("never silently truncates a long message and explicitly rejects an oversized URL", () => {
    const snapshot = copy(buildNetworkWhatsappDemo("combo", "en"));
    const line = snapshot.items[0];
    snapshot.items = Array.from({ length: 50 }, () => copy(line));
    snapshot.totalAmount = multiplyMoney(line.lineTotal, 50);
    const message = formatNetworkOrderWhatsappMessage(snapshot);
    expect(message).toMatch(/50\..*Family combo/);
    expect(message.length).toBeGreaterThan(8192);
    expect(() => buildNetworkWhatsappPreviewUrl("15551234567", message)).toThrowError(NetworkOrderSnapshotFormatError);
  });

  it("rejects a missing price line, linked source, or historical label instead of guessing", () => {
    const pizza = copy(buildNetworkWhatsappDemo("pizza", "en"));
    pizza.items[0].priceBreakdown.splice(1, 1);
    expect(() => formatNetworkOrderWhatsappMessage(pizza)).toThrow(/MISSING_OR_DUPLICATE_PRICE_LINE/);
    const combo = copy(buildNetworkWhatsappDemo("combo", "en"));
    combo.items[0].linkedSources = [];
    expect(() => formatNetworkOrderWhatsappMessage(combo)).toThrow(/MISSING_LINKED_SOURCE_SNAPSHOT/);
    const missingName = copy(buildNetworkWhatsappDemo("pizza", "en"));
    missingName.items[0].productName = "";
    expect(() => formatNetworkOrderWhatsappMessage(missingName)).toThrow(/MISSING_SNAPSHOT_TEXT/);
    const wrongSource = copy(buildNetworkWhatsappDemo("combo", "en")) as any;
    wrongSource.items[0].linkedSources[0].configurationTree.revision = 99;
    expect(() => formatNetworkOrderWhatsappMessage(wrongSource)).toThrow(/LINKED_SNAPSHOT_IDENTITY_MISMATCH/);
  });

  it("rejects malformed item, version, price, quantity, revision and totals", () => {
    const version = copy(buildNetworkWhatsappDemo("pizza", "en")) as any;
    version.snapshotVersion = 9;
    expect(() => formatNetworkOrderWhatsappMessage(version)).toThrow(/UNSUPPORTED_ORDER_SNAPSHOT/);
    const missing = copy(buildNetworkWhatsappDemo("pizza", "en")) as any;
    missing.items[0] = null;
    expect(() => formatNetworkOrderWhatsappMessage(missing)).toThrow(/INVALID_SNAPSHOT_OBJECT/);
    const money = copy(buildNetworkWhatsappDemo("pizza", "en")) as any;
    money.items[0].unitPrice = "1e3";
    expect(() => formatNetworkOrderWhatsappMessage(money)).toThrow(/INVALID_SNAPSHOT_MONEY/);
    const quantity = copy(buildNetworkWhatsappDemo("pizza", "en")) as any;
    quantity.items[0].quantity = 0;
    expect(() => formatNetworkOrderWhatsappMessage(quantity)).toThrow(/INVALID_SNAPSHOT_QUANTITY/);
    const revision = copy(buildNetworkWhatsappDemo("pizza", "en")) as any;
    revision.items[0].configurationRevision = 99;
    expect(() => formatNetworkOrderWhatsappMessage(revision)).toThrow(/PRODUCT_SNAPSHOT_MISMATCH/);
    const total = copy(buildNetworkWhatsappDemo("pizza", "en")) as any;
    total.totalAmount = "1";
    expect(() => formatNetworkOrderWhatsappMessage(total)).toThrow(/ORDER_TOTAL_MISMATCH/);
    const breakdown = copy(buildNetworkWhatsappDemo("pizza", "en")) as any;
    breakdown.items[0].priceBreakdown[0].chargedAmount = "1";
    expect(() => formatNetworkOrderWhatsappMessage(breakdown)).toThrow(/PRICE_LINE_AMOUNT_MISMATCH/);
    const required = copy(buildNetworkWhatsappDemo("combo", "en")) as any;
    required.items[0].canonicalSelection.groups[0].instances.pop();
    expect(() => formatNetworkOrderWhatsappMessage(required)).toThrow(/INVALID_GROUP_QUANTITY/);
  });

  it("refuses Legacy cart snapshots and invalid phone numbers without touching the Legacy formatter", () => {
    expect(() => formatNetworkOrderWhatsappMessage({ items: [] })).toThrow(/UNSUPPORTED_ORDER_SNAPSHOT/);
    expect(() => buildNetworkWhatsappPreviewUrl("+1 555 123 4567", "test")).toThrow(/INVALID_PREVIEW_PHONE/);
  });
});
