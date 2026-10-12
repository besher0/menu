import { ConfigurationIssue, EngineLimits, MoneyString } from "./types";

type DecimalParts = { coefficient: bigint; scale: number };

const MONEY_PATTERN = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

function powerOfTen(value: number) {
  return 10n ** BigInt(value);
}

function parseUnchecked(value: MoneyString): DecimalParts {
  const [integer, fraction = ""] = value.split(".");
  return {
    coefficient: BigInt(`${integer}${fraction}`),
    scale: fraction.length
  };
}

function formatParts(parts: DecimalParts): MoneyString {
  let coefficient = parts.coefficient;
  let scale = parts.scale;

  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }

  if (scale === 0) return coefficient.toString();
  const digits = coefficient.toString().padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function align(left: DecimalParts, right: DecimalParts): [DecimalParts, DecimalParts] {
  const scale = Math.max(left.scale, right.scale);
  return [
    { coefficient: left.coefficient * powerOfTen(scale - left.scale), scale },
    { coefficient: right.coefficient * powerOfTen(scale - right.scale), scale }
  ];
}

export function isMoneyString(value: unknown): value is MoneyString {
  return typeof value === "string" && MONEY_PATTERN.test(value);
}

export function validateMoneyString(
  value: unknown,
  path: string,
  limits: Pick<EngineLimits, "maxMoneyIntegerDigits" | "maxMoneyScale">
): ConfigurationIssue[] {
  if (!isMoneyString(value)) {
    return [{ code: "INVALID_MONEY", path, message: "Money must be a non-negative plain decimal string." }];
  }

  const [integer, fraction = ""] = value.split(".");
  const issues: ConfigurationIssue[] = [];
  if (integer.length > limits.maxMoneyIntegerDigits) {
    issues.push({ code: "MONEY_INTEGER_TOO_LARGE", path, message: "Money integer digits exceed the engine limit." });
  }
  if (fraction.length > limits.maxMoneyScale) {
    issues.push({ code: "MONEY_SCALE_TOO_LARGE", path, message: "Money decimal scale exceeds the engine limit." });
  }
  return issues;
}

export function normalizeMoney(value: MoneyString): MoneyString {
  if (!isMoneyString(value)) throw new Error(`Invalid money string: ${value}`);
  return formatParts(parseUnchecked(value));
}

export function addMoney(left: MoneyString, right: MoneyString): MoneyString {
  const [a, b] = align(parseUnchecked(normalizeMoney(left)), parseUnchecked(normalizeMoney(right)));
  return formatParts({ coefficient: a.coefficient + b.coefficient, scale: a.scale });
}

export function subtractMoney(left: MoneyString, right: MoneyString): MoneyString {
  const [a, b] = align(parseUnchecked(normalizeMoney(left)), parseUnchecked(normalizeMoney(right)));
  if (a.coefficient < b.coefficient) throw new Error("Money subtraction cannot produce a negative value.");
  return formatParts({ coefficient: a.coefficient - b.coefficient, scale: a.scale });
}

export function multiplyMoney(value: MoneyString, quantity: number): MoneyString {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Money quantity must be a non-negative safe integer.");
  const parts = parseUnchecked(normalizeMoney(value));
  return formatParts({ coefficient: parts.coefficient * BigInt(quantity), scale: parts.scale });
}

export function compareMoney(left: MoneyString, right: MoneyString): -1 | 0 | 1 {
  const [a, b] = align(parseUnchecked(normalizeMoney(left)), parseUnchecked(normalizeMoney(right)));
  if (a.coefficient === b.coefficient) return 0;
  return a.coefficient < b.coefficient ? -1 : 1;
}

export function sumMoney(values: readonly MoneyString[]): MoneyString {
  return values.reduce<MoneyString>((sum, value) => addMoney(sum, value), "0");
}
