import { currencyDisplayLabel } from "@menu/shared";
import { displayCurrencyAmount } from "@/lib/currency-display";

export function ConfigurationAmount({ value, currency, locale }: { value: string; currency: string; locale: "ar" | "en" }) {
  const formatted = displayCurrencyAmount(value, currency, locale);
  const label = currencyDisplayLabel(currency, locale);
  if (locale === "ar" && label === "ل.س" && formatted.endsWith(" " + label)) {
    const digits = formatted.slice(0, -(label.length + 1));
    return <bdi dir="rtl" style={{ display: "inline-flex", gap: "0.25em", whiteSpace: "nowrap" }}>
      <bdi dir="ltr">{digits}</bdi>{" "}<bdi dir="rtl">{label}</bdi>
    </bdi>;
  }
  return <bdi>{formatted}</bdi>;
}
