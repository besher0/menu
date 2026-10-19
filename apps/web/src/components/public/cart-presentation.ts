import type { PriceLine } from "@menu/shared";

export type CartChoiceLabel = { label: string; nested: boolean };

/** Compact presentation of the accepted, per-unit breakdown; amounts remain in the trusted quote. */
export function networkCartChoiceLabels(lines: readonly PriceLine[]): CartChoiceLabel[] {
  const rootSizes = lines.filter((line) => line.kind === "SIZE"
    && !line.path.includes(".linked") && !line.path.includes(".children"));
  const headingSize = rootSizes.length === 1 ? rootSizes[0] : null;
  const result: CartChoiceLabel[] = [];
  const grouped = new Map<string, { index: number; count: number; label: string }>();
  for (const line of lines) {
    if (line.kind === "BASE" || line === headingSize) continue;
    const nested = line.path.includes(".children") || line.path.includes(".linked");
    if (line.kind !== "OPTION") {
      result.push({ label: line.label, nested });
      continue;
    }
    const branched = Boolean(line.sourceProductId) || lines.some((other) =>
      other.path.startsWith(`${line.path}.children.`) || other.path.startsWith(`${line.path}.linked.`));
    if (branched) {
      result.push({ label: `1 × ${line.label}`, nested });
      continue;
    }
    const parentPath = line.path.slice(0, line.path.lastIndexOf("."));
    const key = JSON.stringify([parentPath, line.nodeId, line.label, line.amount, line.chargedAmount, line.included]);
    const prior = grouped.get(key);
    if (prior) {
      prior.count += 1;
      result[prior.index].label = `${prior.count} × ${prior.label}`;
    } else {
      grouped.set(key, { index: result.length, count: 1, label: line.label });
      result.push({ label: `1 × ${line.label}`, nested });
    }
  }
  return result;
}
