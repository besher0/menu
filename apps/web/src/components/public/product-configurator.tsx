"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRestaurantShell } from "./restaurant-shell-context";
import { AlertTriangle, Check, Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { multiplyMoney, compareMoney, effectiveOptionPriceV2, parseProductSelectionV2 } from "@menu/shared";
import type {
  ConfigurationGroupV2 as ConfigurationGroup,
  GroupSelectionV2 as GroupSelection,
  OptionGroupSelectionV2 as OptionGroupSelection,
  OptionSelectionInstanceV2 as OptionSelectionInstance,
  ProductConfigurationV2,
  ProductSelectionV2,
  SizeGroupSelectionV2 as SizeGroupSelection
} from "@menu/shared";
import {
  getPublicProductConfiguration,
  getPublicProductQuote,
  PublicProductQuoteError,
  type PublicLinkedConfigurationSource,
  type PublicProductConfigurationResponse,
  type PublicProductQuoteResponse
} from "@/lib/api";
import {
  buildInitialSelection,
  completeForcedSelection,
  buildOptionInstance,
  canAddOptionInstance,
  calculatePublicPreview,
  changeSizeSelection,
  linkedConfiguration,
  LatestQuoteGate,
  updateOptionGroup
} from "./product-configurator-model";
import { groupNeedsChoice, validationPresentation } from "./configuration-validation-presentation";
import styles from "./product-configurator.module.css";
import { SummaryRows } from "./configuration-summary-rows";
import { selectionScope } from "./option-selection-bounds";
import { ConfigurationAmount } from "./configuration-amount";

type Props = {
  restaurantSlug: string;
  productId: string;
  currency: string;
  cartHref?: string;
  cartCount?: number;
  initialSelection?: ProductSelectionV2 | null;
  editingLineId?: string;
  initialQuantity?: number;
  maxQuantity?: number;
  onNetworkQuote?: (quote: PublicProductQuoteResponse, editingLineId?: string, quantity?: number) => boolean;
  checkoutEnabled?: boolean;
  orderingEnabled?: boolean;
  showPrices?: boolean;
  showBottomBar?: boolean;
  hideBottomBarCartIcon?: boolean;
  freshStart?: boolean;
  editableQuantity?: boolean;
  locale?: "ar" | "en";
};

function say(locale: "ar" | "en", ar: string, en: string) {
  return locale === "ar" ? ar : en;
}

function issueText(code: string, fallback: string, locale: "ar" | "en") {
  const messages: Record<string, string> = {
    SIZE_REQUIRED: "اختر حجمًا للمتابعة.",
    GROUP_MIN_NOT_MET: "لم يكتمل الحد الأدنى من الاختيارات المطلوبة.",
    GROUP_MAX_EXCEEDED: "تجاوزت الحد الأقصى المسموح لهذه الخيارات.",
    OPTION_MIN_NOT_MET: "أحد الخيارات الإلزامية لم يكتمل.",
    OPTION_MAX_EXCEEDED: "تجاوزت الكمية المسموحة لهذا الخيار.",
    LINKED_PRODUCT_UNAVAILABLE: "أحد الأصناف المرتبطة غير متاح حاليًا.",
    LINK_TARGET_NOT_FOUND: "تعذر العثور على مصدر أحد الأصناف المرتبطة.",
    MISSING_LINKED_SELECTION: "أكمل اختيارات الصنف المرتبط.",
    PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE: "ميزة تكوين الأصناف غير متاحة لهذه القائمة حاليًا.",
    PRODUCT_UNAVAILABLE: "هذا الصنف غير متاح حاليًا.",
    UNSATISFIABLE_CONFIGURATION: "لا يمكن استيفاء الاختيارات المطلوبة حاليًا."
  };
  const english: Record<string, string> = {
    SIZE_REQUIRED: "Choose a size to continue.", GROUP_MIN_NOT_MET: "Choose the required options.",
    GROUP_MAX_EXCEEDED: "Too many options selected.", OPTION_MIN_NOT_MET: "A required option is missing.",
    OPTION_MAX_EXCEEDED: "The option quantity limit was exceeded.",
    LINKED_PRODUCT_UNAVAILABLE: "A linked product is unavailable.", LINK_TARGET_NOT_FOUND: "A linked product could not be found.",
    MISSING_LINKED_SELECTION: "Complete the linked product choices.",
    PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE: "Configuration is unavailable for this menu.",
    PRODUCT_UNAVAILABLE: "This product is unavailable.", UNSATISFIABLE_CONFIGURATION: "Required choices cannot be completed."
  };
  return (locale === "ar" ? messages : english)[code] ?? fallback;
}

function groupSelection(selection: ProductSelectionV2, groupId: string) {
  return selection.groups.find((item) => item.groupId === groupId);
}

function replaceGroup(selection: ProductSelectionV2, group: GroupSelection) {
  return {
    ...selection,
    groups: selection.groups.some((item) => item.groupId === group.groupId)
      ? selection.groups.map((item) => item.groupId === group.groupId ? group : item)
      : [...selection.groups, group]
  };
}

function sourceMap(sources: readonly PublicLinkedConfigurationSource[]) {
  return new Map(sources.map((source) => [source.productId, source]));
}

function shouldFrame(node: { label: string; highlightInPriceSummary?: boolean; hidePublicLabel?: boolean }, ancestorHasFrame: boolean) {
  return !ancestorHasFrame && node.highlightInPriceSummary === true && !node.hidePublicLabel && node.label.trim().length > 0;
}

const ValidationDisplay = createContext<{ issues: {code:string;path:string;message:string}[]; highlighted: string | null }>({issues:[],highlighted:null});
function validationAttributes(group: ConfigurationGroup, path: string, key: string, display: React.ContextType<typeof ValidationDisplay>) {
  const missing = groupNeedsChoice(group, path, display.issues);
  const highlighted = missing && display.highlighted === key;
  return { "data-validation-key": key, "data-missing-choice": missing || undefined,
    "data-validation-highlight": highlighted || undefined, "aria-invalid": highlighted || undefined, tabIndex: -1 };
}

export function SelectionGroups({
  configuration,
  selection,
  sources,
  currency,
  locale,
  showPrices,
  createId,
  onChange,
  onSelectionProblem,
  ancestorHasFrame, inheritedSizes = new Map<string,string>(), depth = 0, scopePath = "$selection.groups", scopeKey = "$selection.groups"
}: {
  ancestorHasFrame: boolean;
  configuration: ProductConfigurationV2;
  selection: ProductSelectionV2;
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>;
  currency: string;
  locale: "ar" | "en";
  showPrices: boolean;
  createId: (prefix: string) => string;
  onChange: (selection: ProductSelectionV2) => void;
  onSelectionProblem: (label: string) => void;
  inheritedSizes?: ReadonlyMap<string,string>; depth?: number; scopePath?: string; scopeKey?: string;
}) {
  const validation = useContext(ValidationDisplay);
  const scope = selectionScope(sources);
  const selectedSizes = new Map([...inheritedSizes, ...selection.groups.filter(g => g.type === "SIZE").map(g => [g.groupId,g.sizeChoiceId] as const)]);
  return <div className={styles.groups} data-depth={depth}>{configuration.groups.map((group) => {
    const groupPath = `${scopePath}.${group.id}`, groupKey = `${scopeKey}.${group.id}`;
    if (group.type === "SIZE") {
      const selected = groupSelection(selection, group.id) as SizeGroupSelection | undefined;
      const framed = shouldFrame(group, ancestorHasFrame);
      const selectedSize = group.sizes.find((size) => size.id === selected?.sizeChoiceId);
      const sizes = group.sizes.filter(s => group.available !== false && s.available !== false && (group.children ?? []).every(scope.possible));
      return <section {...validationAttributes(group,groupPath,groupKey,validation)} className={styles.group} key={group.id} data-group-id={group.id} data-group-type="SIZE" data-framed={framed || undefined}>
        {!group.hidePublicLabel && <header className={styles.groupHeader}>
          <div><b dir="auto">{group.label}</b><span className={styles.required}>{say(locale, "مطلوب", "Required")}</span></div>
        </header>}
        {sizes.length === 1 && selected?.sizeChoiceId === sizes[0].id ? <div className={styles.componentHeading}><h3>{sizes[0].label}</h3>{showPrices && <small><ConfigurationAmount value={sizes[0].price} currency={currency} locale={locale} /></small>}</div> : <div className={styles.sizeGrid} role="radiogroup" aria-label={group.hidePublicLabel ? say(locale,"الحجم","Size") : group.label}>
          {group.sizes.map((size) => <button
            type="button"
            role="radio"
            aria-checked={selected?.sizeChoiceId === size.id}
            className={selected?.sizeChoiceId === size.id ? styles.selected : ""}
            disabled={!sizes.includes(size)}
            key={size.id}
            onClick={() => {
              const result = changeSizeSelection(selection, group, size.id, sources, createId);
              if (result.selection) onChange(result.selection);
              else onSelectionProblem(result.error);
            }}
          >
            <span dir="auto">{size.label}</span>
            {showPrices ? <strong><ConfigurationAmount value={size.price} currency={currency} locale={locale} /></strong> : null}
          </button>)}
        </div>}
        {selectedSize && selected && (group.children?.length ?? 0) > 0 ? <div className={styles.nested} data-branch="nested">
          <SelectionGroups
            ancestorHasFrame={ancestorHasFrame || framed}
            configuration={{ ...configuration, groups: group.children ?? [] }}
            selection={{ ...selection, groups: selected.children ?? [] }}
            sources={sources}
            currency={currency}
            locale={locale}
            showPrices={showPrices}
            createId={createId}
            inheritedSizes={selectedSizes} depth={depth + 1}
            scopePath={`${groupPath}.children`} scopeKey={`${groupKey}.children`}
            onChange={(nested) => onChange(replaceGroup(selection, { ...selected, children: nested.groups }))}
            onSelectionProblem={onSelectionProblem}
          />
        </div> : null}
      </section>;
    }

    return <OptionGroup
      key={group.id}
      ancestorHasFrame={ancestorHasFrame}
      group={group}
      groupPath={groupPath} groupKey={groupKey}
      configuration={configuration}
      selection={selection}
      sources={sources}
      currency={currency}
      locale={locale}
      showPrices={showPrices}
      createId={createId}
      selectedSizes={selectedSizes} depth={depth}
      onChange={onChange}
      onSelectionProblem={onSelectionProblem}
    />;
  })}</div>;
}

function OptionGroup({
  group, groupPath, groupKey,
  configuration,
  selection,
  sources,
  currency,
  locale,
  showPrices,
  createId,
  ancestorHasFrame, depth, selectedSizes,
  onChange,
  onSelectionProblem
}: {
  group: Extract<ConfigurationGroup, { type: "OPTIONS" }>;
  groupPath: string; groupKey: string;
  ancestorHasFrame: boolean;
  configuration: ProductConfigurationV2;
  selection: ProductSelectionV2;
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>;
  currency: string;
  locale: "ar" | "en";
  showPrices: boolean;
  createId: (prefix: string) => string;
  selectedSizes: ReadonlyMap<string,string>; depth: number;
  onChange: (selection: ProductSelectionV2) => void;
  onSelectionProblem: (label: string) => void;
}) {
  const validation = useContext(ValidationDisplay);
  const selected = groupSelection(selection, group.id) as OptionGroupSelection | undefined;
  const instances = selected?.instances ?? [];
  const bounds = selectionScope(sources).analyze(group);
  const impossible = bounds.state === "ZERO_VALID_SELECTIONS";
  const radioMode = group.min === 1 && group.max === 1 && group.options.every(option => (option.minQuantity ?? 0) === 0);
  const required = group.min > 0 || group.options.some(o => (o.minQuantity ?? 0) > 0);
  const max = group.max ?? 100;

  function setInstances(next: OptionSelectionInstance[]) {
    const children = next.length ? selected?.children ?? buildInitialSelection({ ...configuration, groups: group.children ?? [] }, sources, createId).groups : [];
    onChange(updateOptionGroup(selection, group.id, next, children));
  }

  const framed = shouldFrame(group, ancestorHasFrame);
  const insideGroupFrame = ancestorHasFrame || framed;
  const components = group.options.length > 0 && group.options.every(option => option.linkedProduct);
  return <section {...validationAttributes(group,groupPath,groupKey,validation)} className={styles.group} data-group-id={group.id} data-framed={framed || undefined} data-group-type="OPTIONS" data-components={components || undefined}>
    {(!group.hidePublicLabel || (group.max !== null && group.max > 1) || instances.length < group.min) && <header className={styles.groupHeader}>
      {!group.hidePublicLabel && <div>
        <b dir="auto">{group.label}</b>
        <span className={required ? styles.required : styles.optional}>{required ? say(locale, "مطلوب", "Required") : say(locale, "اختياري", "Optional")}</span>
      </div>}
      {group.max !== null && group.max > 1 ? <span className={styles.tally} aria-live="polite" aria-atomic="true">
        {instances.length} {say(locale, "من", "of")} {group.max}
      </span> : null}
    </header>}
    {impossible && <p role="status">{say(locale,"لا يمكن إكمال هذه المجموعة بالخيارات المتاحة","This group cannot be completed with the available options")}</p>}
    <div className={styles.options} role={radioMode && bounds.state === "MULTIPLE_VALID_SELECTIONS" ? "radiogroup" : "group"} aria-label={group.hidePublicLabel ? say(locale,"الخيارات","Choices") : group.label}>
      {group.options.map((option) => {
        const optionFrame = shouldFrame(option, insideGroupFrame);
        const range = bounds.ranges.get(option.id)!;
        if (!range.available) {
          const previouslySelected = instances.some(i => i.optionId === option.id);
          return <article key={option.id} data-option-id={option.id} data-framed={optionFrame || undefined} className={styles.unavailableOption} role="group" aria-label={option.label} aria-disabled={previouslySelected ? undefined : true}>
            <b dir="auto">{option.label}</b><small>{say(locale, "غير متاح", "Unavailable")}</small>
            {previouslySelected && <button type="button" onClick={() => setInstances(instances.filter(i => i.optionId !== option.id))}>
              {say(locale,"إزالة الاختيار غير المتاح","Remove unavailable selection")}
            </button>}
          </article>;
        }
        const optionInstances = instances.filter((instance) => instance.optionId === option.id);
        const count = optionInstances.length;
        const singleUnit = (impossible ? option.maxQuantity ?? max : range.max) === 1;
        const pricePending = !!option.priceBySize && !selectedSizes.has(option.priceBySize.sizeGroupId);
        const amount = pricePending ? option.price : effectiveOptionPriceV2(option, selectedSizes);
        const canAdd = canAddOptionInstance({
          available: !pricePending,
          optionCount: count,
          optionMax: impossible ? option.maxQuantity ?? max : range.max,
          groupCount: instances.length,
          groupMax: max,
          radioMode
        });
        const canRemove = count > (impossible ? option.minQuantity ?? 0 : range.min);
        const source = option.linkedProduct ? sources.get(option.linkedProduct.sourceProductId) : null;
        const sourceNameAlreadyShown = Boolean(source && option.label.includes(source.name));
        const priceHint = pricePending ? say(locale,"اختر الحجم أولًا","Choose a size first") : compareMoney(amount,"0") === 0
          ? say(locale,"دون زيادة","No extra charge") : <ConfigurationAmount value={amount} currency={currency} locale={locale} />;

        function add() {
          if (!canAdd) return;
          if (radioMode) {
            setInstances([buildOptionInstance(option, sources, createId)]);
            return;
          }
          setInstances([...instances, buildOptionInstance(option, sources, createId)]);
        }

        function remove() {
          if (!canRemove) return;
          const id = optionInstances[optionInstances.length - 1]?.instanceId;
          setInstances(instances.filter((instance) => instance.instanceId !== id));
        }

        const fixedComponent = !impossible && range.min === range.max && count === range.min;
        const childConfig = linkedConfiguration(option, sources);
        function hasPaidSelectedSize(groups: ConfigurationGroup[], choices: GroupSelection[]) {
          return groups.some(g => {
            if (g.type !== "SIZE") return false;
            const chosen = choices.find(choice => choice.groupId === g.id);
            const size = chosen?.type === "SIZE" && g.sizes.find(s => s.id === chosen.sizeChoiceId && s.available !== false);
            return size && compareMoney(size.price,"0") > 0;
          });
        }
        const suppressZero = fixedComponent && count > 0 && compareMoney(amount,"0") === 0
          && group.includedQuantity === 0 && optionInstances.every(instance =>
            hasPaidSelectedSize(option.children ?? [],instance.children ?? []) ||
            (childConfig && hasPaidSelectedSize(childConfig.groups,instance.linkedSelection?.groups ?? [])));
        return <article className={`${styles.option} ${count ? styles.optionSelected : ""}`.trim()} key={option.id} data-option-id={option.id} data-framed={optionFrame || undefined} data-component={option.linkedProduct ? option.id : undefined}>
          {fixedComponent ? <header className={styles.componentHeading}>
            <div className={styles.componentNames}><h3 dir="auto">{option.label}{count > 1 ? " × " + count : ""}</h3>
              {source && !sourceNameAlreadyShown ? <span dir="auto">{source.name}</span> : null}
            </div>
            {count === 0 ? <small>{say(locale,"غير محدد","Not selected")}</small> : showPrices && !suppressZero ? <small>{priceHint}</small> : null}
          </header> : <div className={styles.optionRow}>
            <button
              type="button"
              className={styles.optionLabel}
              role={radioMode ? "radio" : singleUnit ? "checkbox" : undefined}
              aria-checked={radioMode || singleUnit ? count > 0 : undefined}
              disabled={!canAdd && !(count > 0 && (radioMode || singleUnit) && canRemove)}
              onClick={() => count > 0 && radioMode ? undefined : count > 0 && singleUnit && canRemove ? remove() : add()}
            >
              {singleUnit ? <i aria-hidden="true">{count > 0 ? <Check size={13} /> : null}</i> : null}
              <span><b dir="auto">{option.label}</b>{showPrices ? <small>{priceHint}</small> : null}</span>
            </button>
            {!singleUnit ? <div className={styles.quantity}>
              <button type="button" onClick={remove} disabled={!canRemove} aria-label={`${say(locale, "تقليل", "Decrease")} ${option.label}`}><Minus size={14} /></button>
              <strong>{count}</strong>
              <button type="button" onClick={add} disabled={!canAdd} aria-label={`${say(locale, "زيادة", "Increase")} ${option.label}`}><Plus size={14} /></button>
            </div> : null}
          </div>}
          {option.linkedProduct && ((!fixedComponent || !source) && !sourceNameAlreadyShown || source?.orderable === false) ? <div className={styles.linkedMeta}>
            {(!fixedComponent || !source) && !sourceNameAlreadyShown ? <b dir="auto">{source?.name ?? say(locale, "مصدر غير متاح", "Source unavailable")}</b> : null}
            {source && !source.orderable ? <small>{say(locale, "غير قابل للطلب حاليًا", "Currently unavailable")}</small> : null}
          </div> : null}
          {optionInstances.map((instance, index) => {
            const linked = linkedConfiguration(option, sources);
            const hasLinkedChoices = Boolean(linked?.groups.length && instance.linkedSelection);
            if (!(option.children?.length ?? 0) && !hasLinkedChoices) return null;
            return <div className={styles.instance} key={instance.instanceId}>
              {optionInstances.length > 1 ? <small className={styles.instanceName}>{option.label} · {index + 1}</small> : null}
              {(option.children?.length ?? 0) > 0 ? <div className={styles.nested} data-branch="nested">
                <SelectionGroups
                  scopePath={`${groupPath}.instances[${instances.indexOf(instance)}].children`} scopeKey={`${groupKey}.${instance.instanceId}.children`}
                  configuration={{ ...configuration, groups: option.children ?? [] }}
                  inheritedSizes={selectedSizes} selection={{ ...selection, groups: instance.children ?? [] }}
                  sources={sources}
                  currency={currency}
                  locale={locale}
                  showPrices={showPrices}
                  createId={createId}
                  ancestorHasFrame={insideGroupFrame || optionFrame}
                  depth={depth + 1}
                  onChange={(nested) => setInstances(instances.map((item) => item.instanceId === instance.instanceId
                    ? { ...item, children: nested.groups }
                    : item))}
                  onSelectionProblem={onSelectionProblem}
                />
              </div> : null}
              {hasLinkedChoices && linked && instance.linkedSelection ? <div className={styles.linkedSelection} data-branch="linked">
                <SelectionGroups
                  configuration={linked}
                  scopePath={`${groupPath}.instances[${instances.indexOf(instance)}].linkedSelection.groups`} scopeKey={`${groupKey}.${instance.instanceId}.linkedSelection.groups`}
                  selection={instance.linkedSelection}
                  sources={sources}
                  currency={currency}
                  locale={locale}
                  showPrices={showPrices}
                  createId={createId}
                  ancestorHasFrame={insideGroupFrame || optionFrame}
                  depth={depth + 1}
                  onChange={(linkedSelection) => setInstances(instances.map((item) => item.instanceId === instance.instanceId
                    ? { ...item, linkedSelection }
                    : item))}
                  onSelectionProblem={onSelectionProblem}
                />
              </div> : null}
            </div>;
          })}
        </article>;
      })}
    </div>
    {instances.length > 0 && selected && (group.children?.length ?? 0) > 0 ? <div className={styles.nested} data-branch="shared">
      <SelectionGroups scopePath={`${groupPath}.children`} scopeKey={`${groupKey}.children`} configuration={{ ...configuration, groups: group.children ?? [] }} selection={{ ...selection, groups: selected.children ?? [] }}
        sources={sources} currency={currency} locale={locale} showPrices={showPrices} createId={createId}
        inheritedSizes={selectedSizes} depth={depth + 1} ancestorHasFrame={insideGroupFrame}
        onChange={nested => onChange(replaceGroup(selection, { ...selected, children: nested.groups }))} onSelectionProblem={onSelectionProblem} />
    </div> : null}
  </section>;
}


export function ProductConfigurator({ restaurantSlug, productId, currency, cartHref, cartCount = 0, initialSelection,
  editingLineId, initialQuantity = 1, maxQuantity = 100, onNetworkQuote, checkoutEnabled = false,
  orderingEnabled = false, showPrices = true, showBottomBar = false, hideBottomBarCartIcon = false, freshStart = false,
  editableQuantity = false, locale = "ar" }: Props) {
  const shell = useRestaurantShell();
  // Revalidation must not replace an in-progress configuration/selection.
  useEffect(() => shell?.holdSnapshot(), [shell?.holdSnapshot]);
  const [envelope, setEnvelope] = useState<PublicProductConfigurationResponse | null>(null);
  const [selection, setSelection] = useState<ProductSelectionV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continueMessage, setContinueMessage] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [quoteAdded, setQuoteAdded] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [staleEdit, setStaleEdit] = useState(false);
  const [draftQuantity, setDraftQuantity] = useState(Math.max(1, Math.min(100, initialQuantity)));
  const quoteGate = useRef(new LatestQuoteGate());
  const idCounter = useRef(0);
  const createId = (prefix: string) => {
    idCounter.current += 1;
    const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${idCounter.current}`;
    return `${prefix}-${random}`;
  };

  useEffect(() => {
    let cancelled = false;
    quoteGate.current.invalidate();
    setHighlighted(null);
    setEnvelope(null);
    setSelection(null);
    setError(null);
    setQuoteAdded(false);
    setStaleEdit(false);
    void (shell ? shell.configurations.load(restaurantSlug, productId, locale, currency)
      : getPublicProductConfiguration(restaurantSlug, productId))
      .then((value) => {
        if (cancelled) return;
        if (value.schemaVersion !== 2 || value.currency !== currency) throw new Error("Configuration currency or version mismatch");
        const sources = sourceMap(value.linkedProducts);
        const storageKey = `ordersawa:configurator:v2:${restaurantSlug}:${productId}:r${value.configurationRevision}`;
        let initial: ProductSelectionV2 | null = null;
        if (!freshStart) {
          try {
            const stored = window.sessionStorage.getItem(storageKey);
            if (stored) {
              const parsed = parseProductSelectionV2(JSON.parse(stored)).selection;
              if (parsed && parsed.productId === value.productId && parsed.configurationRevision === value.configurationRevision) initial = parsed;
            }
          } catch {
            // Invalid local preview drafts are ignored without affecting server data.
          }
        }
        setEnvelope(value);
        if (value.issues.some(issue => issue.code === "GROUP_LEVEL_LIMIT")) return;
        if (editingLineId && initialSelection) {
          const compatible = initialSelection.schemaVersion === 2 && initialSelection.productId === value.productId
            && initialSelection.configurationRevision === value.configurationRevision;
          setStaleEdit(!compatible);
          setSelection(compatible ? completeForcedSelection(value.configuration, initialSelection, sources, createId, currency) : buildInitialSelection(value.configuration, sources, createId));
        } else {
          setSelection(initial ? completeForcedSelection(value.configuration, initial, sources, createId, currency) : buildInitialSelection(value.configuration, sources, createId));
        }
      })
      .catch(() => {
        if (!cancelled) setError("تعذر تحميل شبكة التكوين العامة لهذا الصنف.");
      });
    return () => { cancelled = true; quoteGate.current.invalidate(); };
  }, [productId, restaurantSlug, editingLineId, freshStart]);

  useEffect(() => { setDraftQuantity(Math.max(1, Math.min(100, initialQuantity))); }, [initialQuantity, editingLineId, productId]);

  useEffect(() => {
    if (!envelope || !selection || freshStart) return;
    const storageKey = `ordersawa:configurator:v2:${restaurantSlug}:${productId}:r${envelope.configurationRevision}`;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(selection));
    } catch {
      // Local draft persistence is optional and must never block configuration.
    }
  }, [envelope, productId, restaurantSlug, selection, freshStart]);

  const sources = useMemo(() => sourceMap(envelope?.linkedProducts ?? []), [envelope]);
  const preview = useMemo(
    () => envelope && selection ? calculatePublicPreview(envelope, restaurantSlug, selection) : null,
    [envelope, restaurantSlug, selection]
  );

  if (error) return <section className={styles.state} dir={locale === "ar" ? "rtl" : "ltr"}><AlertTriangle size={22} /><b>{locale === "ar" ? error : "Could not load this product's choices."}</b></section>;
  if (envelope?.issues.some(issue => issue.code === "GROUP_LEVEL_LIMIT")) return <section className={styles.state} role="status">{say(locale, "تجاوز هذا التكوين الحد المسموح للتداخل.", "This configuration exceeds the nesting limit.")}</section>;
  if (!envelope || !selection || !preview) return <section className={`${styles.state} public-configuration-loading`} dir={locale === "ar" ? "rtl" : "ltr"}><Loader2 className={styles.spin} size={22} /><b>{say(locale, "جارٍ تحميل خيارات الصنف...", "Loading product choices...")}</b></section>;

  const presentation = validationPresentation(preview.issues);
  function revealMissing() {
    const target = root.current?.querySelector<HTMLElement>('[data-missing-choice="true"]');
    if (!target) return;
    setHighlighted(target.dataset.validationKey ?? null);
    // Current selected branches are expanded. Preserve support for native disclosure ancestors.
    for (let parent = target.parentElement; parent && parent !== root.current; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    target.focus({preventScroll:true});
    target.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  }
  async function continuePreview() {
    if (!preview?.valid || preview.total === null) {
      if (presentation.missing.length) { setContinueMessage(null); revealMissing(); }
      else setContinueMessage(say(locale, "تعذر التحقق من هذا التكوين.", "This configuration could not be validated."));
      return;
    }
    if (!orderingEnabled || !envelope?.orderable || !selection || !onNetworkQuote || draftQuantity > maxQuantity) {
      setContinueMessage(say(locale, "لا يمكن إضافة هذا التكوين إلى السلة حاليًا.", "This configuration cannot be added to the cart right now."));
      return;
    }
    const requestId = quoteGate.current.next();
    setQuoteBusy(true);
    setContinueMessage(null);
    setQuoteAdded(false);
    try {
      const quote = await getPublicProductQuote(restaurantSlug, productId, selection);
      if (!quoteGate.current.isCurrent(requestId)) return;
      if (!onNetworkQuote(quote, editingLineId, draftQuantity)) {
        setContinueMessage(say(locale, "استجابة السعر غير متوافقة أو تجاوزت السلة الحد؛ لم تُعدَّل السلة.", "The quote is incompatible or the cart limit was exceeded. The cart was not changed."));
        return;
      }
      setContinueMessage(editingLineId
        ? say(locale, "حُفظت الاختيارات في السلة.", "Choices saved in the cart.")
        : say(locale, "أُضيف الصنف إلى السلة.", "Item added to the cart."));
      setQuoteAdded(true);
      setStaleEdit(false);
    } catch (error) {
      if (!quoteGate.current.isCurrent(requestId)) return;
      // Keep the user's selection, but do not reuse a possibly obsolete graph
      // on the next opening after an authoritative quote rejection.
      shell?.configurations.clear();
      if (error instanceof PublicProductQuoteError) {
        const firstIssue = error.issues[0];
        setContinueMessage(firstIssue ? issueText(firstIssue.code, firstIssue.message, locale) : error.message);
      } else {
        setContinueMessage(say(locale, "تعذر الاتصال بخدمة السعر؛ لم تُضف إلى السلة.", "Could not verify the price; nothing was added to the cart."));
      }
    } finally {
      if (quoteGate.current.isCurrent(requestId)) setQuoteBusy(false);
    }
  }

  const canAdd = orderingEnabled && (preview.valid || (presentation.missing.length > 0 && !presentation.other.length)) && envelope.orderable && draftQuantity <= maxQuantity && !quoteBusy;
  return <ValidationDisplay.Provider value={{issues:presentation.missing,highlighted}}>
    <section ref={root} className={styles.configurator} dir={locale === "ar" ? "rtl" : "ltr"} data-testid="public-product-configurator">
    <header className={styles.heading}>
      <h2>{say(locale, "تخصيص الصنف", "Customize product")}</h2>
    </header>

    {!envelope.orderable ? <div className={styles.unavailable}><AlertTriangle size={18} /><div><b>{say(locale, "التكوين غير قابل للطلب حاليًا", "This configuration is currently unavailable")}</b></div></div> : null}

    {staleEdit ? <div className={styles.unavailable}><AlertTriangle size={18} /><div><b>{say(locale, "تغيّر تكوين الصنف منذ إضافته للسلة", "Product choices changed since this item was added")}</b><p>{say(locale, "اختيارات السلة القديمة محفوظة دون تعديل. راجع التكوين الحالي واحفظه إذا رغبت.", "Your previous cart choices were not changed. Review and save the current choices if you wish.")}</p></div></div> : null}

    <SelectionGroups
      ancestorHasFrame={false}
      configuration={envelope.configuration}
      selection={selection}
      sources={sources}
      currency={currency}
      locale={locale}
      showPrices={showPrices}
      createId={createId}
      onChange={(next) => { quoteGate.current.invalidate(); setQuoteBusy(false); setContinueMessage(null); setQuoteAdded(false); setSelection(completeForcedSelection(envelope.configuration, next, sources, createId, currency)); }}
      onSelectionProblem={(label) => setContinueMessage(say(locale,
        `لا يمكن نقل اختيار «${label}» إلى الحجم الجديد. صحّح الاختيار أولًا ثم حاول مجددًا.`,
        `The choice “${label}” is not valid for the new size. Adjust it first, then try again.`))}
    />

    {showPrices ? <aside className={styles.summary} aria-live="polite">
      <div className={styles.summaryTitle}><span>{say(locale, "ملخص السعر", "Price summary")}</span></div>
      {preview.valid && preview.total !== null ? <>
        <SummaryRows lines={preview.lines} total={preview.total} envelope={envelope} selection={selection} currency={currency} locale={locale} />
        <div className={styles.unitPrice}><span>{say(locale, "سعر القطعة مع الإضافات", "Price per item with choices")}</span><b><ConfigurationAmount value={preview.total} currency={currency} locale={locale} /></b></div>
        <div className={styles.unitPrice}><span>{say(locale, "الكمية", "Quantity")}</span><b>× {draftQuantity}</b></div>
        <div className={styles.total}><span>{say(locale, "الإجمالي", "Total")}</span><strong><ConfigurationAmount value={multiplyMoney(preview.total, draftQuantity)} currency={currency} locale={locale} /></strong></div>
      </> : <>
        {presentation.missing.length > 0 && <div className={styles.incomplete} data-testid="incomplete-choices">
          <b>{say(locale,"بقيت اختيارات مطلوبة","Required choices remain")}</b>
          <span>{say(locale,"أكمل اختياراتك لعرض السعر النهائي.","Complete your choices to see the final price.")}</span>
          <button type="button" onClick={revealMissing}>{say(locale,"عرض الخيارات الناقصة","Show missing choices")}</button>
        </div>}
        {presentation.other.length > 0 && <div className={styles.errors}><ul>{presentation.other.slice(0,8).map((issue,index)=><li key={index}>{issueText(issue.code,issue.message,locale)}</li>)}</ul></div>}
      </>}
    </aside> : null}

    <div className={styles.previewGate}>
      {editableQuantity && !showBottomBar ? <div className="quantity-control" aria-label={say(locale, "كمية التكوين الجاري", "Current configuration quantity")}>
        <button type="button" onClick={() => setDraftQuantity((value) => Math.min(maxQuantity, value + 1))}
          disabled={draftQuantity >= maxQuantity} aria-label={say(locale, "زيادة الكمية", "Increase quantity")}><Plus size={16} /></button>
        <strong>{draftQuantity}</strong>
        <button type="button" onClick={() => setDraftQuantity((value) => Math.max(1, value - 1))}
          disabled={draftQuantity <= 1} aria-label={say(locale, "إنقاص الكمية", "Decrease quantity")}><Minus size={16} /></button>
      </div> : null}
      {!showBottomBar ? <button type="button" onClick={() => void continuePreview()} disabled={!canAdd}>
        {quoteBusy ? say(locale, "جارٍ التحقق من السعر...", "Checking the price...") : editingLineId ? say(locale, "حفظ التكوين في السلة", "Save cart choices") : say(locale, "إضافة إلى السلة", "Add to cart")}
      </button> : null}
      {!showPrices ? <p>{say(locale, "أسعار هذه القائمة مخفية؛ لا يمكن إضافة الصنف للسلة.", "Prices are hidden for this menu; this item cannot be added to the cart.")}</p>
        : !checkoutEnabled || !orderingEnabled ? <p>{say(locale, "لا يمكن طلب هذا الصنف حاليًا.", "This item cannot be ordered right now.")}</p> : null}
      {continueMessage ? <strong>{continueMessage}</strong> : null}
      {cartHref && quoteAdded && !showBottomBar ? <a href={cartHref}>{say(locale, "عرض السلة", "View cart")}</a> : null}
    </div>
    </section>
    {showBottomBar ? <div className="product-bottom-cart product-bottom-cart-network" dir="ltr">
      <div className="quantity-control" aria-label={say(locale, "كمية التكوين الجاري", "Current configuration quantity")}>
        <button type="button" onClick={() => setDraftQuantity((value) => Math.min(maxQuantity, value + 1))} disabled={draftQuantity >= maxQuantity} aria-label={say(locale, "زيادة الكمية", "Increase quantity")}><Plus size={16} /></button>
        <strong>{draftQuantity}</strong>
        <button type="button" onClick={() => setDraftQuantity((value) => Math.max(1, value - 1))} disabled={draftQuantity <= 1} aria-label={say(locale, "إنقاص الكمية", "Decrease quantity")}><Minus size={16} /></button>
      </div>
      <button type="button" className="product-cart-link" dir={locale === "ar" ? "rtl" : "ltr"} onClick={() => void continuePreview()} disabled={!canAdd}>
        {quoteBusy ? <Loader2 size={18} className={styles.spin} /> : !hideBottomBarCartIcon ? <ShoppingBag size={18} /> : null}
        <span>{editingLineId ? say(locale, "حفظ التكوين", "Save choices") : say(locale, "إضافة إلى السلة", "Add to cart")}</span>
      </button>
      {cartHref ? <a href={cartHref} className="product-network-cart-shortcut" aria-label={say(locale, "عرض السلة", "View cart")} title={say(locale, "عرض السلة", "View cart")}><ShoppingBag size={20} /><b>{cartCount}</b></a> : null}
    </div> : null}
  </ValidationDisplay.Provider>;
}
