import { compareMoney, sumMoney, type ConfigurationGroupV2 as ConfigurationGroup, type GroupSelectionV2 as GroupSelection, type PriceLine, type ProductSelectionV2 } from "@menu/shared";
import type { PublicProductConfigurationResponse } from "@/lib/api";
import styles from "./product-configurator.module.css";
import { displayRoundingDifference } from "@/lib/currency-display";
import { ConfigurationAmount } from "./configuration-amount";

type Row = {
  key: string;
  label: string;
  emphasized: boolean;
  charges: PriceLine[];
  children: Row[];
};

function row(key: string, label: string, emphasized = false): Row {
  return { key, label, emphasized, charges: [], children: [] };
}

/** Each engine line can be consumed exactly once, including waived units. */
export function configurationSummary(envelope: PublicProductConfigurationResponse, selection: ProductSelectionV2, lines: PriceLine[], total: string) {
  const remaining = new Map(lines.map(line => [line.path, line]));
  const sources = new Map(envelope.linkedProducts.map(source => [source.productId, source]));
  const root = row("$selection.groups", envelope.productName, true);
  function take(path: string, kind: PriceLine["kind"], node: string, instance?: string, source?: string) {
    const line = remaining.get(path);
    if (!line || line.kind !== kind || line.nodeId !== node || line.instanceId !== instance || line.sourceProductId !== source) {
      throw Error("Unmatched price line");
    }
    remaining.delete(path);
    return line;
  }
  function visit(groups: ConfigurationGroup[], selected: GroupSelection[], path: string, owner: Row, sizeCount: number, carried: PriceLine[] = []) {
    for (const value of selected) {
      const group = groups.find(g => g.id === value.groupId);
      if (!group) throw Error("Unmatched group");
      const key = path + "." + group.id;
      const named = !group.hidePublicLabel && Boolean(group.label.trim());
      const starred = named && group.highlightInPriceSummary === true;
      if (group.type === "SIZE" && value.type === "SIZE") {
        const size = group.sizes.find(s => s.id === value.sizeChoiceId);
        if (!size) throw Error("Unmatched size");
        const line = take(key, "SIZE", size.id);
        let target = owner;
        // The root product's sole size belongs in its title, including a starred
        // size group. Nested/linked starred groups retain their established rows.
        if (sizeCount === 1 && (owner === root || !starred)) {
          const suffix = " — " + size.label;
          if (!owner.label.endsWith(suffix)) owner.label += suffix;
        } else {
          if (named) {
            target = row(key, group.label, starred);
            owner.children.push(target);
          }
          const choice = row(key + "." + size.id, size.label);
          target.children.push(choice);
          target = choice;
        }
        target.charges.push(line);
        const nested = value.children ?? [];
        visit(group.children ?? [], nested, key + "." + size.id, target, 0);
      } else if (group.type === "OPTIONS" && value.type === "OPTIONS") {
        const parent = starred ? row(key, group.label, true) : owner;
        if (starred && value.instances.length) owner.children.push(parent);
        for (const instance of value.instances) {
          const option = group.options.find(o => o.id === instance.optionId);
          if (!option) throw Error("Unmatched option");
          const branch = key + "." + instance.instanceId;
          const link = option.linkedProduct;
          const target = row(branch, option.label, option.highlightInPriceSummary === true);
          const optionLine = take(branch, "OPTION", option.id, instance.instanceId, link?.sourceProductId);
          target.charges.push(...carried, optionLine);
          parent.children.push(target);
          const own = instance.children ?? [];
          const linked = instance.linkedSelection;
          const sizes = [...own, ...(linked?.groups ?? [])].filter(g => g.type === "SIZE").length;
          const config = link?.mode === "CUSTOM" ? link.customConfiguration : link && sources.get(link.sourceProductId)?.configuration;
          if (linked && (!config || linked.productId !== config.productId || linked.configurationRevision !== config.revision)) throw Error("Unmatched linked selection");
          const ownGroups = option.children ?? [];
          const linkedGroups = config?.groups ?? [];
          const onlyGroup = ownGroups.length ? ownGroups[0] : linkedGroups[0];
          const choices = ownGroups.length ? own : linked?.groups;
          // Inspect the defined branches as well as the actual selection. Even an
          // unselected sibling group makes attribution to this flavour ambiguous.
          const canCarry = ownGroups.length + linkedGroups.length === 1 && onlyGroup?.type === "OPTIONS"
            && onlyGroup.max === 1 && choices?.length === 1 && choices[0].groupId === onlyGroup.id
            && choices[0].type === "OPTIONS" && choices[0].instances.length === 1
            && compareMoney(optionLine.chargedAmount, "0") > 0;
          const transfer = canCarry ? target.charges.splice(0) : [];
          if (linked && config) visit(linkedGroups, linked.groups, branch + ".linked", target, sizes, linkedGroups.length ? transfer : []);
          visit(ownGroups, own, branch + ".children", target, sizes, ownGroups.length ? transfer : []);
        }
        if (value.instances.length) visit(group.children ?? [], value.children ?? [], key + ".children", parent, 0);
      } else throw Error("Incompatible group");
    }
  }
  try {
    if (remaining.size !== lines.length || selection.productId !== envelope.productId || selection.configurationRevision !== envelope.configurationRevision) throw Error("Ambiguous configuration");
    if (remaining.has("$configuration.basePrice")) root.charges.push(take("$configuration.basePrice", "BASE", envelope.productId));
    visit(envelope.configuration.groups, selection.groups, root.key, root, selection.groups.filter(g => g.type === "SIZE").length);
    const displayed = new Set<PriceLine>();
    function reconcile(item: Row) {
      for (const line of item.charges) {
        if (displayed.has(line)) throw Error("Repeated display charge");
        displayed.add(line);
      }
      item.children.forEach(reconcile);
    }
    reconcile(root);
    if (remaining.size || displayed.size !== lines.length || compareMoney(sumMoney(Array.from(displayed, l => l.chargedAmount)), total) !== 0) throw Error("Unreconciled breakdown");
    return { root, mode: "grouped" };
  } catch {
    // Engine labels are individual choice labels. Never reconstruct a group name from a path.
    const fallback = row("$fallback", envelope.productName, true);
    lines.forEach((line, index) => {
      if (line.kind === "BASE") fallback.charges.push(line);
      else {
        const item = row(String(index), line.label);
        item.charges.push(line);
        fallback.children.push(item);
      }
    });
    return { root: fallback, mode: "original" };
  }
}

export function SummaryRows({ lines, total, envelope, selection, currency, locale }: {
  lines: PriceLine[]; total: string; envelope: PublicProductConfigurationResponse; selection: ProductSelectionV2; currency: string; locale: "ar" | "en";
}) {
  const { root, mode } = configurationSummary(envelope, selection, lines, total);
  const displayedCharges: string[] = [];
  function render(item: Row): React.ReactNode {
    const amount = sumMoney(item.charges.map(line => line.chargedAmount));
    if (item.charges.length) displayedCharges.push(amount);
    const Label = item.emphasized ? "strong" : "span";
    return <section key={item.key} data-summary-part={item.key}>
      <div data-summary-heading={item.children.length > 0 && !item.charges.length ? "" : undefined} {...(item.children.length || item === root ? { "data-summary-title": "" } : { "data-summary-detail": "" })}>
        <Label dir="auto">{item.label}</Label>
        {compareMoney(amount, "0") !== 0
          ? <b data-charge={amount}><ConfigurationAmount value={amount} currency={currency} locale={locale} /></b>
          : item.charges.some(line => line.kind !== "BASE") && <small data-charge="0">{locale === "ar" ? "دون زيادة" : "No extra charge"}</small>}
      </div>
      {item.children.map(render)}
    </section>;
  }
  const content = render(root);
  const rounding = displayRoundingDifference(displayedCharges, total, currency);
  return <div data-summary-mode={mode}>{content}
    {rounding && <p className={styles.hint}>{locale === "ar" ? "فرق عرض الأسعار" : "Displayed price difference"}: <bdi>{rounding}</bdi></p>}
  </div>;
}
