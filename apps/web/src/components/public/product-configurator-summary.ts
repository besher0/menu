import { multiplyMoney } from "@menu/shared";
import type { PriceLine } from "@menu/shared";

export type DisplayPriceLine = { label: string; chargedAmount?: string; included: boolean };

/** Presentation only: retain every trusted charge, and never merge branched instances. */
export function summarizeConfigurationPriceLines(
  lines: readonly PriceLine[], productName: string, quantity: number
): DisplayPriceLine[] {
  const rootSizes = lines.filter((line) => line.kind === "SIZE"
    && !line.path.includes(".linked") && !line.path.includes(".children"));
  const primarySize = rootSizes.length === 1 ? rootSizes[0] : null;
  const base = lines.find((line) => line.kind === "BASE");
  const result: DisplayPriceLine[] = [{
    label: `${quantity} × ${productName}${primarySize ? ` — ${primarySize.label}` : ""}`,
    chargedAmount: primarySize?.chargedAmount ?? base?.chargedAmount,
    included: false
  }];
  const grouped = new Map<string, { row: DisplayPriceLine; count: number }>();
  for (const line of lines) {
    if (line === primarySize || line === base && !primarySize) continue;
    if (line.kind !== "OPTION") {
      result.push({ label: line.label, chargedAmount: line.chargedAmount, included: line.included });
      continue;
    }
    const hasBranch = lines.some((other) => other.path.startsWith(`${line.path}.children.`)
      || other.path.startsWith(`${line.path}.linked.`));
    if (hasBranch || line.sourceProductId) {
      result.push({ label: `1 × ${line.label}`, chargedAmount: line.chargedAmount, included: line.included });
      continue;
    }
    const parentPath = line.path.slice(0, line.path.lastIndexOf("."));
    const key = JSON.stringify([parentPath, line.nodeId, line.label, line.amount, line.chargedAmount, line.included]);
    const prior = grouped.get(key);
    if (prior) {
      prior.count += 1;
      prior.row.label = `${prior.count} × ${line.label}`;
      prior.row.chargedAmount = multiplyMoney(line.chargedAmount, prior.count);
    } else {
      const row = { label: `1 × ${line.label}`, chargedAmount: line.chargedAmount, included: line.included };
      result.push(row);
      grouped.set(key, { row, count: 1 });
    }
  }
  return result;
}
