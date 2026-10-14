import { describe, expect, it } from "vitest";
import { displayCurrencyAmount, displayRoundingDifference } from "@/lib/currency-display";

describe("current-menu currency display", () => {
  it("shows Syrian pounds without decimals and exposes invalid historical fractional values", () => {
    expect(displayCurrencyAmount("12500.000000", "SYP")).toBe("12500 SYP");
    expect(displayCurrencyAmount("12500.000000", "ل.س")).toBe("12500 ل.س");
    expect(displayCurrencyAmount("12500.5", "SYP")).toBe("سعر غير صالح للعملة");
    expect(displayCurrencyAmount(null, "SYP")).toBe("—");
  });

  it("rounds only presentation for EUR, USD and AED and reveals component differences", () => {
    for (const currency of ["EUR", "USD", "AED"]) {
      expect(displayCurrencyAmount("2.345678", currency)).toBe(`2.35 ${currency}`);
    }
    expect(displayRoundingDifference(["0.005", "0.005"], "0.01", "USD")).toBe("-0.01 USD");
  });
});
