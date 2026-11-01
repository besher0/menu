import { describe, expect, it } from "vitest";
import { PublicMenuService } from "./public-menu.service";

const formatter = (new PublicMenuService({} as never, {} as never, {} as never) as unknown as {
  buildWhatsappMessage: (input: Record<string, unknown>) => string;
}).buildWhatsappMessage;

describe("persisted Legacy WhatsApp message presentation", () => {
  const base = {
    restaurantName: "مطعم Demo", branchName: "فرع التجربة", orderNumber: "003",
    fulfillmentType: "pickup", currency: "SYP", showPrices: true,
    items: [{ name: "بيتزا Demo", quantity: 2, unitPrice: "100", totalPrice: "200",
      options: ["زيتون"], note: "بدون بصل" }],
    itemsSubtotal: "200", deliveryFee: null, totalAmount: "200"
  };

  it("uses the persisted order number, keeps preparation details and puts customer details last", () => {
    const message = formatter({ ...base, customerName: "خالد", orderNote: "ملاحظة حقيقية" });
    expect(message).toContain("🧾 طلب جديد — OrderSawa #003");
    expect(message).not.toContain("الفرع:");
    expect(message).toContain("2 × ⁨بيتزا Demo⁩");
    expect(message).toContain("• ⁨زيتون⁩");
    expect(message).toContain("*ملاحظة الصنف: ⁨بدون بصل⁩*");
    expect(message.indexOf("مجموع الأصناف")).toBeGreaterThan(message.indexOf("إجمالي الصنف"));
    expect(message.indexOf("الاسم:")).toBeGreaterThan(message.indexOf("الإجمالي:"));
    expect(message).toContain("رسوم التوصيل: لا تُضاف للاستلام");
    expect(message).toContain("*ملاحظات الطلب:*");
    expect(message).toContain("*⁨ملاحظة حقيقية⁩*");
    expect(message.indexOf("ملاحظات الطلب")).toBeLessThan(message.indexOf("مجموع الأصناف"));
  });

  it("keeps unknown delivery fee explicit and never invents a final amount or address", () => {
    const message = formatter({ ...base, fulfillmentType: "delivery", deliveryArea: "منطقة أ",
      deliveryNear: "قرب الحديقة", deliveryFee: null });
    expect(message).toContain("رسوم التوصيل: تُحدّد حسب المنطقة");
    expect(message).toContain("الإجمالي: يُحدّد بعد رسوم التوصيل");
    expect(message).not.toContain("جانب:");
    expect(message).not.toContain("العنوان:");
    expect(message).toContain("المنطقة: ⁨منطقة أ⁩");
  });
});
