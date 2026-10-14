import { compareMoney, normalizeMoney, sumMoney, validateMoneyString } from "./product-configuration/money";
import { DEFAULT_ENGINE_LIMITS, type ConfigurationGroup, type ConfigurationIssue, type ProductConfigurationV1 } from "./product-configuration/types";

/** Presentation policy only. Pricing and persisted Decimal(24,6) values stay exact. */
export function currencyDisplayScale(currency: string): 0 | 2 | null {
  // Older Restaurant rows use the Arabic currency label as their stored value.
  if (currency === "SYP" || currency === "ل.س") return 0;
  if (currency === "EUR" || currency === "USD" || currency === "AED") return 2;
  return null; // Do not invent a policy for other currencies.
}

export function validateCurrencyAmount(value: unknown, currency: string, path: string): ConfigurationIssue[] {
  const issues = validateMoneyString(value, path, DEFAULT_ENGINE_LIMITS);
  if (issues.length || currencyDisplayScale(currency) !== 0) return issues;
  if (normalizeMoney(value as string).includes(".")) {
    return [{ code: "SYP_FRACTIONAL_PRICE", path, message: "SYP prices must be whole amounts; fractional values are not allowed." }];
  }
  return [];
}

/** Traverse every price-bearing V1 node, including nested CUSTOM snapshots. */
export function validateConfigurationCurrency(configuration: ProductConfigurationV1, currency: string): ConfigurationIssue[] {
  if (currencyDisplayScale(currency) !== 0) return [];
  const issues: ConfigurationIssue[] = [];
  const visited = new Set<ProductConfigurationV1>();
  function visit(config: ProductConfigurationV1, path: string) {
    if (visited.has(config)) return; // validateConfiguration reports reference cycles separately.
    visited.add(config);
    if (config.basePrice !== null) issues.push(...validateCurrencyAmount(config.basePrice, currency, `${path}.basePrice`));
    function groups(nodes: readonly ConfigurationGroup[], prefix: string) {
      nodes.forEach((group, groupIndex) => {
        const groupPath = `${prefix}[${groupIndex}]`;
        if (group.type === "SIZE") {
          group.sizes.forEach((size, sizeIndex) => {
            const sizePath = `${groupPath}.sizes[${sizeIndex}]`;
            issues.push(...validateCurrencyAmount(size.price, currency, `${sizePath}.price`));
            groups(size.children ?? [], `${sizePath}.children`);
          });
        } else {
          group.options.forEach((option, optionIndex) => {
            const optionPath = `${groupPath}.options[${optionIndex}]`;
            issues.push(...validateCurrencyAmount(option.price, currency, `${optionPath}.price`));
            option.priceOverrides?.forEach((override, overrideIndex) => {
              if (override.price !== null) issues.push(...validateCurrencyAmount(override.price, currency, `${optionPath}.priceOverrides[${overrideIndex}].price`));
            });
            Object.entries(option.linkedProduct?.originalPriceOverrides ?? {}).forEach(([id, price]) => {
              issues.push(...validateCurrencyAmount(price, currency, `${optionPath}.linkedProduct.originalPriceOverrides.${id}`));
            });
            if (option.linkedProduct?.mode === "CUSTOM" && option.linkedProduct.customConfiguration) {
              visit(option.linkedProduct.customConfiguration, `${optionPath}.linkedProduct.customConfiguration`);
            }
            groups(option.children ?? [], `${optionPath}.children`);
          });
        }
      });
    }
    groups(config.groups, `${path}.groups`);
  }
  visit(configuration, "$configuration");
  return issues;
}

function minorUnits(value: string, scale: 0 | 2): bigint {
  const issues = validateMoneyString(value, "$amount", DEFAULT_ENGINE_LIMITS);
  if (issues.length) throw new Error(`INVALID_CURRENCY_AMOUNT: ${issues[0].code}`);
  if (scale === 0 && normalizeMoney(value).includes(".")) throw new Error("SYP_FRACTIONAL_PRICE");
  const [whole, fraction = ""] = value.split(".");
  const coefficient = BigInt(`${whole}${fraction}`);
  if (fraction.length <= scale) return coefficient * (10n ** BigInt(scale - fraction.length));
  const divisor = 10n ** BigInt(fraction.length - scale);
  const quotient = coefficient / divisor;
  return (coefficient % divisor) * 2n >= divisor ? quotient + 1n : quotient;
}

function formatMinor(value: bigint, scale: 0 | 2): string {
  const whole = value / (10n ** BigInt(scale));
  if (scale === 0) return whole.toString();
  return `${whole}.${(value % 100n).toString().padStart(2, "0")}`;
}

/** Non-negative HALF_UP at the approved display scale; never changes the input. */
export function formatDecimalForDisplay(value: string, scale: 0 | 2): string {
  return formatMinor(minorUnits(value, scale), scale);
}

export function formatCurrencyAmount(value: string, currency: string): string {
  const scale = currencyDisplayScale(currency);
  if (scale === null) {
    const issues = validateMoneyString(value, "$amount", DEFAULT_ENGINE_LIMITS);
    if (issues.length) throw new Error(`INVALID_CURRENCY_AMOUNT: ${issues[0].code}`);
    return `${normalizeMoney(value)} ${currency}`;
  }
  return `${formatDecimalForDisplay(value, scale)} ${currency}`;
}

/** Difference caused solely by rounding displayed lines independently of their exact total. */
export function currencyDisplayReconciliation(lineTotals: readonly string[], exactTotal: string, currency: string): string | null {
  const scale = currencyDisplayScale(currency);
  if (scale === null) return null;
  if (compareMoney(sumMoney(lineTotals), exactTotal) !== 0) throw new Error("CURRENCY_LINE_TOTAL_MISMATCH");
  const difference = minorUnits(exactTotal, scale) - lineTotals.reduce((sum, line) => sum + minorUnits(line, scale), 0n);
  if (difference === 0n) return null;
  const sign = difference < 0n ? "-" : "+";
  return `${sign}${formatMinor(difference < 0n ? -difference : difference, scale)} ${currency}`;
}
