"use client";
import { displayCurrencyAmount, displayRoundingDifference } from "@/lib/currency-display";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Minus, Plus, RotateCcw } from "lucide-react";
import {
  calculatePrice,
  PRODUCT_SELECTION_SCHEMA_VERSION,
  type ConfigurationGroup,
  type GroupSelection,
  type LinkedProductCatalogEntry,
  type OptionChoice,
  type OptionGroupSelection,
  type OptionSelectionInstance,
  type ProductConfigurationContext,
  type ProductConfigurationV1,
  type ProductSelectionV1,
  type SizeGroupSelection
} from "@menu/shared";
import { newNodeId } from "./editor-model";
import { issueMessage } from "./messages";
import type { ProductConfigurationEnvelope } from "./types";

function linkedConfiguration(option: OptionChoice, sources: ReadonlyMap<string, ProductConfigurationEnvelope>) {
  const linked = option.linkedProduct;
  if (!linked) return null;
  if (linked.mode === "CUSTOM") return linked.customConfiguration ?? null;
  return sources.get(linked.sourceProductId)?.configurationTree ?? null;
}

function buildGroups(
  groups: ConfigurationGroup[],
  sources: ReadonlyMap<string, ProductConfigurationEnvelope>
): GroupSelection[] {
  return groups.map((group) => {
    if (group.type === "SIZE") {
      const size = group.sizes.find((item) => item.available !== false) ?? group.sizes[0];
      return {
        type: "SIZE",
        groupId: group.id,
        sizeChoiceId: size?.id ?? "",
        children: size ? buildGroups(size.children ?? [], sources) : []
      };
    }
    const instances: OptionSelectionInstance[] = [];
    group.options.forEach((option) => {
      const minimum = option.available === false ? 0 : option.minQuantity ?? 0;
      for (let index = 0; index < minimum; index += 1) instances.push(buildInstance(option, sources));
    });
    let optionIndex = 0;
    while (instances.length < group.min && optionIndex < group.options.length * 100) {
      const option = group.options[optionIndex % Math.max(1, group.options.length)];
      const quantity = instances.filter((item) => item.optionId === option?.id).length;
      if (option && option.available !== false && quantity < option.maxQuantity) instances.push(buildInstance(option, sources));
      optionIndex += 1;
    }
    return { type: "OPTIONS", groupId: group.id, instances };
  });
}

function buildInstance(option: OptionChoice, sources: ReadonlyMap<string, ProductConfigurationEnvelope>): OptionSelectionInstance {
  const linked = linkedConfiguration(option, sources);
  return {
    instanceId: newNodeId("selection"),
    optionId: option.id,
    children: buildGroups(option.children ?? [], sources),
    ...(linked ? { linkedSelection: buildSelection(linked, sources) } : {})
  };
}

export function buildSelection(
  configuration: ProductConfigurationV1,
  sources: ReadonlyMap<string, ProductConfigurationEnvelope>
): ProductSelectionV1 {
  return {
    schemaVersion: PRODUCT_SELECTION_SCHEMA_VERSION,
    productId: configuration.productId,
    configurationRevision: configuration.revision,
    groups: buildGroups(configuration.groups, sources)
  };
}

function replaceGroup(selection: ProductSelectionV1, group: GroupSelection) {
  return {
    ...selection,
    groups: selection.groups.some((item) => item.groupId === group.groupId)
      ? selection.groups.map((item) => item.groupId === group.groupId ? group : item)
      : [...selection.groups, group]
  };
}

function SelectionGroups({
  configuration,
  selection,
  sources,
  currency,
  onChange
}: {
  configuration: ProductConfigurationV1;
  selection: ProductSelectionV1;
  sources: ReadonlyMap<string, ProductConfigurationEnvelope>;
  currency: string;
  onChange: (selection: ProductSelectionV1) => void;
}) {
  return <div className="pc-preview-groups">{configuration.groups.map((group) => {
    if (group.type === "SIZE") {
      const selected = selection.groups.find((item): item is SizeGroupSelection => item.type === "SIZE" && item.groupId === group.id);
      const selectedSize = group.sizes.find((size) => size.id === selected?.sizeChoiceId);
      return <section className="pc-preview-group" key={group.id}>
        <b>{group.label}</b>
        <div className="pc-preview-size-list">{group.sizes.map((size) => <button
          type="button"
          className={selected?.sizeChoiceId === size.id ? "active" : ""}
          disabled={size.available === false}
          key={size.id}
          onClick={() => onChange(replaceGroup(selection, {
            type: "SIZE",
            groupId: group.id,
            sizeChoiceId: size.id,
            children: buildGroups(size.children ?? [], sources)
          }))}
        ><span>{size.label}</span><small>{displayCurrencyAmount(size.price, currency)}</small></button>)}</div>
        {selectedSize && selected ? <SelectionGroups
          configuration={{ ...configuration, groups: selectedSize.children ?? [] }}
          selection={{ ...selection, groups: selected.children ?? [] }}
          sources={sources}
          currency={currency}
          onChange={(nested) => onChange(replaceGroup(selection, { ...selected, children: nested.groups }))}
        /> : null}
      </section>;
    }

    const selected = selection.groups.find((item): item is OptionGroupSelection => item.type === "OPTIONS" && item.groupId === group.id)
      ?? { type: "OPTIONS" as const, groupId: group.id, instances: [] };
    const total = selected.instances.length;
    return <section className="pc-preview-group" key={group.id}>
      <div className="pc-preview-group-title"><b>{group.label}</b><small>{total}{group.max === null ? "" : ` / ${group.max}`}</small></div>
      {group.options.map((option) => {
        const instances = selected.instances.filter((instance) => instance.optionId === option.id);
        const minimum = option.minQuantity ?? 0;
        const canAdd = option.available !== false && instances.length < option.maxQuantity && (group.max === null || total < group.max);
        return <div className="pc-preview-option" key={option.id}>
          <div><span>{option.label}</span><small>{displayCurrencyAmount(option.price, currency)}</small></div>
          <span className="pc-quantity-control">
            <button type="button" disabled={instances.length <= minimum} onClick={() => {
              const removeId = instances[instances.length - 1]?.instanceId;
              onChange(replaceGroup(selection, { ...selected, instances: selected.instances.filter((item) => item.instanceId !== removeId) }));
            }}><Minus size={14} /></button>
            <b>{instances.length}</b>
            <button type="button" disabled={!canAdd} onClick={() => onChange(replaceGroup(selection, { ...selected, instances: [...selected.instances, buildInstance(option, sources)] }))}><Plus size={14} /></button>
          </span>
          {instances.map((instance, index) => {
            const linked = linkedConfiguration(option, sources);
            return <div className="pc-preview-instance" key={instance.instanceId}>
              {instances.length > 1 ? <small>الوحدة {index + 1}</small> : null}
              {option.children?.length ? <SelectionGroups
                configuration={{ ...configuration, groups: option.children }}
                selection={{ ...selection, groups: instance.children ?? [] }}
                sources={sources}
                currency={currency}
                onChange={(nested) => onChange(replaceGroup(selection, {
                  ...selected,
                  instances: selected.instances.map((item) => item.instanceId === instance.instanceId ? { ...item, children: nested.groups } : item)
                }))}
              /> : null}
              {linked && instance.linkedSelection ? <div className="pc-linked-preview-selection"><b>اختيارات الصنف المرتبط</b><SelectionGroups
                configuration={linked}
                selection={instance.linkedSelection}
                sources={sources}
                currency={currency}
                onChange={(linkedSelection) => onChange(replaceGroup(selection, {
                  ...selected,
                  instances: selected.instances.map((item) => item.instanceId === instance.instanceId ? { ...item, linkedSelection } : item)
                }))}
              /></div> : null}
            </div>;
          })}
        </div>;
      })}
      <small className="pc-preview-rule">الحد الأدنى {group.min} · {group.max === null ? "بلا حد تاجر (حد المنصة 100)" : `الحد الأقصى ${group.max}`} · المشمول {group.includedQuantity}</small>
    </section>;
  })}</div>;
}

function pricingContext(
  restaurantId: string,
  sources: ReadonlyMap<string, ProductConfigurationEnvelope>
): ProductConfigurationContext {
  const linkedProducts = new Map<string, LinkedProductCatalogEntry>();
  sources.forEach((source, productId) => {
    const configuration = source.configurationTree ?? {
      schemaVersion: 1,
      productId,
      revision: source.configurationVersion,
      basePrice: source.basePrice,
      groups: []
    };
    linkedProducts.set(productId, {
      productId,
      catalogId: restaurantId,
      configuration,
      available: source.isAvailable,
      orderable: source.isAvailable
    });
  });
  return { catalogId: restaurantId, linkedProducts };
}

export function ConfigurationPreview({
  configuration,
  currency,
  restaurantId,
  sources
}: {
  configuration: ProductConfigurationV1;
  currency: string;
  restaurantId: string;
  sources: ReadonlyMap<string, ProductConfigurationEnvelope>;
}) {
  const [selection, setSelection] = useState(() => buildSelection(configuration, sources));
  const configurationKey = JSON.stringify(configuration);
  const sourceKey = [...sources.entries()].map(([id, value]) => `${id}:${value.configurationVersion}`).join("|");
  useEffect(() => setSelection(buildSelection(configuration, sources)), [configurationKey, sourceKey]);
  const result = useMemo(
    () => calculatePrice(configuration, selection, pricingContext(restaurantId, sources)),
    [configuration, selection, restaurantId, sources]
  );
  return (
    <section className="pc-preview" dir="rtl">
      <header><div><Calculator size={19} /><b>معاينة واختبار التسعير</b></div><button type="button" onClick={() => setSelection(buildSelection(configuration, sources))}><RotateCcw size={14} /> إعادة الضبط</button></header>
      <SelectionGroups configuration={configuration} selection={selection} sources={sources} currency={currency} onChange={setSelection} />
      {result.valid && result.total !== null ? (
        <div className="pc-price-result">
          <div><span>السعر النهائي</span><b>{displayCurrencyAmount(result.total, currency)}</b></div>
          {result.baseIgnored ? <small>تم تجاهل Base Price لأن المسار يحتوي على Size.</small> : null}
          <ul>{result.lines.map((line, index) => <li key={`${line.path}-${index}`}><span>{line.label}{line.included ? " (مشمول)" : ""}</span><b>{displayCurrencyAmount(line.chargedAmount, currency)}</b></li>)}</ul>
          {displayRoundingDifference(result.lines.map((line) => line.chargedAmount), result.total, currency)
            ? <small>فرق عرض التقريب: {displayRoundingDifference(result.lines.map((line) => line.chargedAmount), result.total, currency)}</small> : null}
        </div>
      ) : (
        <div className="pc-preview-errors"><b>لا يمكن عرض سعر قبل اكتمال التكوين</b><ul>{result.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issueMessage(issue)}</li>)}</ul></div>
      )}
    </section>
  );
}
