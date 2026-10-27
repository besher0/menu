import { describe, expect, it } from "vitest";
import { parseDeliveryFeeInput, readDeliveryFee } from "./delivery-fee";

describe("restaurant delivery fee policy", () => {
  it("keeps pending, free and fixed fees distinct", () => {
    expect(parseDeliveryFeeInput(null, "SYP")).toBeNull();
    expect(parseDeliveryFeeInput("", "SYP")).toBeNull();
    expect(parseDeliveryFeeInput("0.000000", "SYP")).toBe("0");
    expect(parseDeliveryFeeInput("12000.000000", "SYP")).toBe("12000");
    expect(readDeliveryFee({ deliveryFee: "0" }, "SYP")).toBe("0");
    expect(readDeliveryFee({}, "SYP")).toBeNull();
  });

  it("rejects fractional Syrian fees, negatives and malformed stored settings", () => {
    expect(() => parseDeliveryFeeInput("1.50", "SYP")).toThrow();
    expect(() => parseDeliveryFeeInput("-1", "SYP")).toThrow();
    expect(() => parseDeliveryFeeInput(5, "SYP")).toThrow();
    expect(() => readDeliveryFee({ deliveryFee: "2.5" }, "SYP")).toThrow();
  });
});
