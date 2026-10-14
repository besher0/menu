import { describe, expect, it } from "vitest";
import { currencyDisplayReconciliation, formatCurrencyAmount, validateConfigurationCurrency, validateCurrencyAmount } from "./currency-policy";
import type { ProductConfigurationV1 } from "./product-configuration/types";

describe("approved current-restaurant currency policy", () => {
  it("accepts numeric whole SYP including zero-filled fractional notation, rejects real fractions", () => {
    expect(validateCurrencyAmount("12500", "SYP", "$price")).toEqual([]);
    expect(validateCurrencyAmount("12500.000000", "SYP", "$price")).toEqual([]);
    expect(validateCurrencyAmount("12500.000000", "ل.س", "$price")).toEqual([]);
    expect(validateCurrencyAmount("0", "SYP", "$price")).toEqual([]);
    expect(validateCurrencyAmount("12500.50", "SYP", "$price")[0]).toMatchObject({ code: "SYP_FRACTIONAL_PRICE", path: "$price" });
    expect(validateCurrencyAmount("12500.50", "ل.س", "$price")[0]).toMatchObject({ code: "SYP_FRACTIONAL_PRICE" });
    expect(() => formatCurrencyAmount("12500.50", "SYP")).toThrow("SYP_FRACTIONAL_PRICE");
  });

  it("uses exact decimal HALF_UP for presentation without changing six-decimal input", () => {
    for (const currency of ["EUR", "USD", "AED"]) {
      const input = "12.345678";
      expect(formatCurrencyAmount(input, currency)).toBe(`12.35 ${currency}`);
      expect(input).toBe("12.345678");
      expect(formatCurrencyAmount("0.004999", currency)).toBe(`0.00 ${currency}`);
      expect(formatCurrencyAmount("0.005000", currency)).toBe(`0.01 ${currency}`);
    }
    expect(formatCurrencyAmount("12500.000000", "SYP")).toBe("12500 SYP");
    expect(formatCurrencyAmount("12500.000000", "ل.س")).toBe("12500 ل.س");
    expect(formatCurrencyAmount("1.123456", "EGP")).toBe("1.123456 EGP");
  });

  it("makes displayed component/total differences explicit", () => {
    expect(currencyDisplayReconciliation(["0.005", "0.005"], "0.01", "USD")).toBe("-0.01 USD");
    expect(currencyDisplayReconciliation(["0.004", "0.004"], "0.008", "EUR")).toBe("+0.01 EUR");
    expect(currencyDisplayReconciliation(["1", "2"], "3", "SYP")).toBeNull();
    expect(() => currencyDisplayReconciliation(["1"], "2", "USD")).toThrow("CURRENCY_LINE_TOTAL_MISMATCH");
  });

  it("visits base, sizes, nested options, size overrides, ORIGINAL overrides and CUSTOM snapshots", () => {
    const custom: ProductConfigurationV1 = { schemaVersion: 1, productId: "source", revision: 1, basePrice: "0.2", groups: [] };
    const tree: ProductConfigurationV1 = { schemaVersion: 1, productId: "owner", revision: 1, basePrice: null, groups: [
      { type: "SIZE", id: "sizes", label: "Sizes", sizes: [{ id: "small", label: "Small", price: "100.000001", children: [
        { type: "OPTIONS", id: "nested", label: "Nested", min: 0, max: 2, includedQuantity: 0, options: [{
          id: "cheese", label: "Cheese", price: "0.5", maxQuantity: 2,
          priceOverrides: [{ sizeChoiceId: "small", price: "0.25" }],
          linkedProduct: { sourceProductId: "source", mode: "CUSTOM", customConfiguration: custom, originalPriceOverrides: { extra: "1.1" } }
        }] }
      ] }] }
    ] };
    const issues = validateConfigurationCurrency(tree, "SYP");
    expect(issues.map((issue) => issue.code)).toEqual(Array(5).fill("SYP_FRACTIONAL_PRICE"));
    expect(issues.some((issue) => issue.path.includes("customConfiguration.basePrice"))).toBe(true);
    expect(validateConfigurationCurrency(tree, "USD")).toEqual([]);
  });
});
