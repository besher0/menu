import { currencyDisplayReconciliation, formatCurrencyAmount } from "@menu/shared";

/** UI-only rendering. Invalid historical values are never rounded into valid prices. */
export function displayCurrencyAmount(value: string | number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "—";
  try {
    return formatCurrencyAmount(String(value), currency);
  } catch {
    return "سعر غير صالح للعملة";
  }
}

export function displayRoundingDifference(lineTotals: readonly string[], total: string, currency: string): string | null {
  try {
    return currencyDisplayReconciliation(lineTotals, total, currency);
  } catch {
    return null; // Invalid historical money is shown as invalid by displayCurrencyAmount.
  }
}
