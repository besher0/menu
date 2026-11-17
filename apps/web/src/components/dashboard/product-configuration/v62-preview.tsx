"use client";
import { useEffect, useMemo, useState } from "react";
import { calculatePriceV2, completeAnonymousSelectionV2, resolveLinkedConfigurationV2, validateConfigurationV2,
  type ProductConfigurationV2 as Config, type ProductSelectionV2 as Selection, type GroupSelectionV2 as Pick,
  type OptionChoiceV2 as Option, type ConfigurationGroupV2 as Group } from "@menu/shared";
import { displayCurrencyAmount } from "@/lib/currency-display";
import { pricingContext, newId, shouldFrame, type SourceMap } from "./v62-model";

export function buildSelectionV2(config: Config): Selection {
  const groups = (nodes: Group[]): Pick[] => nodes.flatMap<Pick>(group => {
    if (group.available === false) return [];
    if (group.type === "SIZE") {
      const size = group.sizes.find(s => s.available !== false);
      return size ? [{ type: "SIZE", groupId: group.id, sizeChoiceId: size.id, children: groups(group.children ?? []) }] : [];
    }
    return [{ type: "OPTIONS", groupId: group.id, instances: [], children: [] }];
  });
  return { schemaVersion: 2, productId: config.productId, configurationRevision: config.revision, groups: groups(config.groups) };
}
export function ConfigurationPreviewV2({ configuration, currency, restaurantId, sources }: {
  configuration: Config; currency: string; restaurantId: string; sources: SourceMap;
}) {
  const context = useMemo(() => pricingContext(restaurantId, currency, sources), [restaurantId, currency, sources]);
  const initial = () => completeAnonymousSelectionV2(configuration, buildSelectionV2(configuration), context).selection;
  const [selection, setSelection] = useState<Selection>(initial);
  const configurationKey = JSON.stringify(configuration);
  useEffect(() => setSelection(initial()), [configurationKey, context]);
  const result = useMemo(() => calculatePriceV2(configuration, selection, context), [configuration, selection, context]);
  const invalid = validateConfigurationV2(configuration);
  const update = (next: Selection) => setSelection(completeAnonymousSelectionV2(configuration, next, context).selection);
  function linked(option: Option, productId: string) {
    return option.linkedProduct ? resolveLinkedConfigurationV2(option.linkedProduct, context, "$preview", [productId]).resolved?.configuration : undefined;
  }
  const headings: Array<{ key: string; label: string; bold: boolean }> = [];
  const highlighted = new Set<string>();
  function summaryMetadata(tree: Config, selected: Selection, prefix = tree.productId) {
    function visit(groups: Group[], picked: Pick[], path: string) {
      for (const group of groups) {
        const selection = picked.find(x => x.groupId === group.id);
        if (!selection || selection.type === "OPTIONS" && !selection.instances.length) continue;
        if (!group.hidePublicLabel) headings.push({ key: path + group.id, label: group.label, bold: !!group.highlightInPriceSummary });
        visit(group.children ?? [], selection.children ?? [], path + group.id + "/");
        if (group.type === "OPTIONS" && selection.type === "OPTIONS") for (const unit of selection.instances) {
          const option = group.options.find(x => x.id === unit.optionId);
          if (!option) continue;
          if (option.highlightInPriceSummary) highlighted.add(option.id);
          visit(option.children ?? [], unit.children ?? [], path + unit.instanceId + "/");
          const source = linked(option, tree.productId);
          if (source && unit.linkedSelection) summaryMetadata(source, unit.linkedSelection, path + unit.instanceId + "/linked/");
        }
      }
    }
    visit(tree.groups, selected.groups, prefix + "/");
  }
  if (result.valid) summaryMetadata(configuration, selection);
  function renderGroups(tree: Config, defs: Group[], values: Pick[], change: (next: Pick[]) => void, ancestorFrame = false): React.ReactNode {
    const replace = (next: Pick) => change(values.some(x => x.groupId === next.groupId) ? values.map(x => x.groupId === next.groupId ? next : x) : [...values, next]);
    return defs.map(group => {
      const picked = values.find(x => x.groupId === group.id), framed = shouldFrame(group, ancestorFrame), inside = ancestorFrame || framed;
      const title = !group.hidePublicLabel && (group.highlightInPriceSummary ? <strong>{group.label}</strong> : <b>{group.label}</b>);
      if (group.type === "SIZE") {
        const selected = picked?.type === "SIZE" ? picked : undefined;
        return <section className={"pc-preview-group " + (framed ? "config-highlight-frame" : "")} key={group.id}>
          {title}<div className="pc-preview-size-list">{group.sizes.map(size => <button type="button" key={size.id} disabled={size.available === false || group.available === false}
            aria-pressed={selected?.sizeChoiceId === size.id} className={selected?.sizeChoiceId === size.id ? "active" : ""}
            onClick={() => replace({ type: "SIZE", groupId: group.id, sizeChoiceId: size.id,
              children: selected?.children ?? buildSelectionV2({ ...tree, groups: group.children ?? [] }).groups })}>
            {size.label}<small>{displayCurrencyAmount(size.price, currency)}</small>
          </button>)}</div>
          {selected && renderGroups(tree, group.children ?? [], selected.children ?? [], children => replace({ ...selected, children }), inside)}
        </section>;
      }
      const selected = picked?.type === "OPTIONS" ? picked : { type: "OPTIONS" as const, groupId: group.id, instances: [] };
      return <section className={"pc-preview-group " + (framed ? "config-highlight-frame" : "")} key={group.id}>
        {title}<small>Min {group.min} · Max {group.max ?? "بلا حد"} · مشمول {group.includedQuantity}</small>
        {group.options.map(option => {
          const units = selected.instances.filter(x => x.optionId === option.id);
          const source = linked(option, tree.productId);
          const optionFrame = shouldFrame(option, inside);
          return <div className={optionFrame ? "config-highlight-frame" : ""} key={option.id}>
            <div className="pc-preview-option"><span>{option.highlightInPriceSummary ? <strong>{option.label}</strong> : option.label}</span>
              <span className="pc-quantity-control">
                <button type="button" aria-label={"إنقاص " + option.label} disabled={units.length <= (option.minQuantity ?? 0)} onClick={() =>
                  replace({ ...selected, instances: selected.instances.filter(x => x.instanceId !== units[units.length - 1].instanceId) })}>−</button>
                <b>{units.length}</b>
                <button type="button" aria-label={"اختيار " + option.label} disabled={option.available === false || group.available === false ||
                  units.length >= (option.maxQuantity ?? 100) || selected.instances.length >= (group.max ?? 100)} onClick={() => replace({
                    ...selected, children: selected.children?.length ? selected.children : buildSelectionV2({ ...tree, groups: group.children ?? [] }).groups,
                    instances: [...selected.instances, { instanceId: newId(), optionId: option.id,
                      children: buildSelectionV2({ ...tree, groups: option.children ?? [] }).groups,
                      ...(source ? { linkedSelection: buildSelectionV2(source) } : {}) }]
                  })}>+</button>
              </span>
            </div>
            {units.map((unit, index) => <div className="pc-preview-instance" key={unit.instanceId}>
              {units.length > 1 && <small>الوحدة {index + 1}</small>}
              {renderGroups(tree, option.children ?? [], unit.children ?? [], children => replace({
                ...selected, instances: selected.instances.map(x => x.instanceId === unit.instanceId ? { ...x, children } : x)
              }), inside || optionFrame)}
              {source && unit.linkedSelection && renderGroups(source, source.groups, unit.linkedSelection.groups, groups => replace({
                ...selected, instances: selected.instances.map(x => x.instanceId === unit.instanceId
                  ? { ...x, linkedSelection: { ...unit.linkedSelection!, groups } } : x)
              }), inside || optionFrame)}
            </div>)}
          </div>;
        })}
        {selected.instances.length > 0 && renderGroups(tree, group.children ?? [], selected.children ?? [], children => replace({ ...selected, children }), inside)}
      </section>;
    });
  }
  return <section className="pc-preview" aria-label="معاينة التكوين V2">
    <header><b>معاينة واختبار التكوين</b><button type="button" onClick={() => setSelection(initial())}>إعادة الضبط</button></header>
    <p className="config-help-box">معاينة إدارية تستخدم Shared V2 فقط؛ ليست Quote نهائية ولا Cart أو Checkout. لا تُحفظ اختيارات المعاينة في المنتج.</p>
    {invalid.length ? <p role="status">أكمل بيانات الشبكة قبل اختبار الاختيارات والأسعار.</p> : renderGroups(configuration, configuration.groups, selection.groups, groups => update({ ...selection, groups }))}
    {result.valid && result.total !== null ? <div className="pc-price-result">
      <div><b>السعر من المحرك المشترك</b><b>{displayCurrencyAmount(result.total, currency)}</b></div>
      {result.baseIgnored && <small>Base محفوظة لكن الأحجام تتحكم في السعر.</small>}
      <div aria-label="عناوين ملخص السعر">{headings.map((heading, i) => heading.bold
        ? <strong key={heading.key + i} style={{ display: "block" }}>{heading.label}</strong>
        : <span key={heading.key + i} style={{ display: "block" }}>{heading.label}</span>)}</div>
      <ul>{result.lines.map((line, index) => <li key={index}><span>{highlighted.has(line.nodeId) ? <strong>{line.label}</strong> : line.label}{line.included ? " — مشمول" : ""}</span><b>{displayCurrencyAmount(line.chargedAmount, currency)}</b></li>)}</ul>
    </div> : <div className="pc-preview-errors" role="status"><b>لا يُعرض سعر تخميني</b><ul>{result.issues.map((issue, index) => <li key={index}>{issue.code}: {issue.message}</li>)}</ul></div>}
  </section>;
}
