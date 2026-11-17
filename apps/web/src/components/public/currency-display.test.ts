import { describe, expect, it } from "vitest";
import { displayCurrencyAmount, displayRoundingDifference } from "@/lib/currency-display";

describe("current-menu currency display", () => {
  it("shows Syrian pounds without decimals and exposes invalid historical fractional values", () => {
    expect(displayCurrencyAmount("12500.000000", "SYP")).toBe("12500 SYP");
    expect(displayCurrencyAmount("12500.000000", "ل.س")).toBe("12500 ل.س");
    expect(displayCurrencyAmount("12500.5", "SYP")).toBe("سعر غير صالح للعملة");
    expect(displayCurrencyAmount(null, "SYP")).toBe("—");
  });

  it("localizes Syrian pound labels without changing the currency precision or other currencies", () => {
    for (const code of ["SYP", "ل.س"]) {
      expect(displayCurrencyAmount("80.000", code, "ar")).toBe("80 ل.س");
      expect(displayCurrencyAmount("80.000", code, "en")).toBe("80 SYP");
      expect(displayCurrencyAmount("80.5", code, "ar")).toBe("سعر غير صالح للعملة");
    }
    for (const locale of ["ar", "en"] as const) {
      for (const code of ["USD", "EUR", "AED"]) expect(displayCurrencyAmount("2.345", code, locale)).toBe(`2.35 ${code}`);
      expect(displayCurrencyAmount("80", "EGP", locale)).toBe("80 EGP");
    }
  });

  it("rounds only presentation for EUR, USD and AED and reveals component differences", () => {
    for (const currency of ["EUR", "USD", "AED"]) {
      expect(displayCurrencyAmount("2.345678", currency)).toBe(`2.35 ${currency}`);
    }
    expect(displayRoundingDifference(["0.005", "0.005"], "0.01", "USD")).toBe("-0.01 USD");
  });
});
