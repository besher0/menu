"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { multiplyMoney } from "@menu/shared";
import type {
  ConfigurationGroup,
  GroupSelection,
  OptionGroupSelection,
  OptionSelectionInstance,
  ProductConfigurationV1,
  ProductSelectionV1,
  SizeGroupSelection
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
  buildOptionInstance,
  canAddOptionInstance,
  calculatePublicPreview,
  changeSizeSelection,
  linkedConfiguration,
  LatestQuoteGate,
  updateOptionGroup
} from "./product-configurator-model";
import styles from "./product-configurator.module.css";
import { summarizeConfigurationPriceLines } from "./product-configurator-summary";
import { displayCurrencyAmount, displayRoundingDifference } from "@/lib/currency-display";

type Props = {
  restaurantSlug: string;
  productId: string;
  currency: string;
  cartHref?: string;
  cartCount?: number;
  initialSelection?: ProductSelectionV1 | null;
  editingLineId?: string;
  initialQuantity?: number;
  maxQuantity?: number;
  onNetworkQuote?: (quote: PublicProductQuoteResponse, editingLineId?: string, quantity?: number) => boolean;
  checkoutEnabled?: boolean;
  orderingEnabled?: boolean;
  showPrices?: boolean;
  showBottomBar?: boolean;
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

function groupSelection(selection: ProductSelectionV1, groupId: string) {
  return selection.groups.find((item) => item.groupId === groupId);
}

function replaceGroup(selection: ProductSelectionV1, group: GroupSelection) {
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

function SelectionGroups({
  configuration,
  selection,
  sources,
  currency,
  locale,
  showPrices,
  createId,
  onChange,
  onSelectionProblem,
  depth = 0
}: {
  configuration: ProductConfigurationV1;
  selection: ProductSelectionV1;
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>;
  currency: string;
  locale: "ar" | "en";
  showPrices: boolean;
  createId: (prefix: string) => string;
  onChange: (selection: ProductSelectionV1) => void;
  onSelectionProblem: (label: string) => void;
  depth?: number;
}) {
  return <div className={styles.groups} data-depth={depth}>{configuration.groups.map((group) => {
    if (group.type === "SIZE") {
      const selected = groupSelection(selection, group.id) as SizeGroupSelection | undefined;
      const selectedSize = group.sizes.find((size) => size.id === selected?.sizeChoiceId);
      return <section className={styles.group} key={group.id} data-group-type="SIZE">
        <header className={styles.groupHeader}>
          <div><b dir="auto">{group.label}</b><span className={styles.required}>{say(locale, "مطلوب", "Required")}</span></div>
        </header>
        <div className={styles.sizeGrid} role="radiogroup" aria-label={group.label}>
          {group.sizes.map((size) => <button
            type="button"
            role="radio"
            aria-checked={selected?.sizeChoiceId === size.id}
            className={selected?.sizeChoiceId === size.id ? styles.selected : ""}
            disabled={size.available === false}
            key={size.id}
            onClick={() => {
              const result = changeSizeSelection(selection, group, size.id, sources, createId);
              if (result.selection) onChange(result.selection);
              else onSelectionProblem(result.error);
            }}
          >
            <span dir="auto">{size.label}</span>
            {showPrices ? <strong>{displayCurrencyAmount(size.price, currency)}</strong> : null}
          </button>)}
        </div>
        {selectedSize && selected && (selectedSize.children?.length ?? 0) > 0 ? <div className={styles.nested}>
          <SelectionGroups
            configuration={{ ...configuration, groups: selectedSize.children ?? [] }}
            selection={{ ...selection, groups: selected.children ?? [] }}
            sources={sources}
            currency={currency}
            locale={locale}
            showPrices={showPrices}
            createId={createId}
            depth={depth + 1}
            onChange={(nested) => onChange(replaceGroup(selection, { ...selected, children: nested.groups }))}
            onSelectionProblem={onSelectionProblem}
          />
        </div> : null}
      </section>;
    }

    return <OptionGroup
      key={group.id}
      group={group}
      configuration={configuration}
      selection={selection}
      sources={sources}
      currency={currency}
      locale={locale}
      showPrices={showPrices}
      createId={createId}
      depth={depth}
      onChange={onChange}
      onSelectionProblem={onSelectionProblem}
    />;
  })}</div>;
}

function OptionGroup({
  group,
  configuration,
  selection,
  sources,
  currency,
  locale,
  showPrices,
  createId,
  depth,
  onChange,
  onSelectionProblem
}: {
  group: Extract<ConfigurationGroup, { type: "OPTIONS" }>;
  configuration: ProductConfigurationV1;
  selection: ProductSelectionV1;
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>;
  currency: string;
  locale: "ar" | "en";
  showPrices: boolean;
  createId: (prefix: string) => string;
  depth: number;
  onChange: (selection: ProductSelectionV1) => void;
  onSelectionProblem: (label: string) => void;
}) {
  const selected = groupSelection(selection, group.id) as OptionGroupSelection | undefined;
  const instances = selected?.instances ?? [];
  const radioMode = group.max === 1 && group.options.every(
    (option) => option.maxQuantity === 1 && (option.minQuantity ?? 0) === 0
  );
  const max = group.max ?? 100;

  function setInstances(next: OptionSelectionInstance[]) {
    onChange(updateOptionGroup(selection, group.id, next));
  }

  return <section className={styles.group} data-group-type="OPTIONS">
    <header className={styles.groupHeader}>
      <div>
        <b dir="auto">{group.label}</b>
        <span className={group.min > 0 ? styles.required : styles.optional}>{group.min > 0 ? say(locale, "مطلوب", "Required") : say(locale, "اختياري", "Optional")}</span>
      </div>
      {group.max === 1 ? <small>{group.min > 0 ? say(locale, "اختر خيارًا واحدًا", "Choose one option") : say(locale, "اختر خيارًا واحدًا كحد أقصى", "Choose up to one option")}</small>
        : group.max !== null && group.min === group.max ? <small>{say(locale, `اختر ${group.min} خيارات`, `Choose ${group.min} options`)}</small>
        : group.max !== null ? <small>{group.min > 0
          ? say(locale, `اختر من ${group.min} إلى ${group.max} خيارات`, `Choose ${group.min} to ${group.max} options`)
          : say(locale, `اختر حتى ${group.max} خيارات`, `Choose up to ${group.max} options`)}</small>
          : group.min > 0 ? <small>{say(locale, `اختر ${group.min} خيارات على الأقل`, `Choose at least ${group.min} options`)}</small> : null}
    </header>
    <div className={styles.options} role={radioMode ? "radiogroup" : "group"} aria-label={group.label}>
      {group.options.map((option) => {
        const optionInstances = instances.filter((instance) => instance.optionId === option.id);
        const count = optionInstances.length;
        const canAdd = canAddOptionInstance({
          available: option.available !== false,
          optionCount: count,
          optionMax: option.maxQuantity,
          groupCount: instances.length,
          groupMax: max,
          radioMode
        });
        const canRemove = count > (option.minQuantity ?? 0);
        const source = option.linkedProduct ? sources.get(option.linkedProduct.sourceProductId) : null;
        const sourceNameAlreadyShown = Boolean(source && option.label.includes(source.name));
        const priceHint = option.priceOverrides?.length ? say(locale, "يتغير حسب الحجم", "Varies by size") : option.price;

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

        return <article className={`${styles.option} ${count ? styles.optionSelected : ""}`.trim()} key={option.id}>
          <div className={styles.optionRow}>
            <button
              type="button"
              className={styles.optionLabel}
              role={radioMode ? "radio" : option.maxQuantity === 1 ? "checkbox" : undefined}
              aria-checked={radioMode || option.maxQuantity === 1 ? count > 0 : undefined}
              disabled={option.available === false}
              onClick={() => count > 0 && (radioMode || option.maxQuantity === 1) && canRemove ? remove() : add()}
            >
              <i>{count > 0 ? <Check size={14} /> : null}</i>
              <span><b dir="auto">{option.label}</b>{showPrices ? <small>{priceHint === option.price ? displayCurrencyAmount(option.price, currency) : priceHint}</small> : null}</span>
            </button>
            {option.maxQuantity > 1 ? <div className={styles.quantity}>
              <button type="button" onClick={remove} disabled={!canRemove} aria-label={`${say(locale, "تقليل", "Decrease")} ${option.label}`}><Minus size={14} /></button>
              <strong>{count}</strong>
              <button type="button" onClick={add} disabled={!canAdd} aria-label={`${say(locale, "زيادة", "Increase")} ${option.label}`}><Plus size={14} /></button>
            </div> : null}
          </div>
          {option.linkedProduct && (!sourceNameAlreadyShown || source?.orderable === false) ? <div className={styles.linkedMeta}>
            {!sourceNameAlreadyShown ? <b dir="auto">{source?.name ?? say(locale, "مصدر غير متاح", "Source unavailable")}</b> : null}
            {source && !source.orderable ? <small>{say(locale, "غير قابل للطلب حاليًا", "Currently unavailable")}</small> : null}
          </div> : null}
          {optionInstances.map((instance) => {
            const linked = linkedConfiguration(option, sources);
            const hasLinkedChoices = Boolean(linked?.groups.length && instance.linkedSelection);
            if (!(option.children?.length ?? 0) && !hasLinkedChoices) return null;
            return <div className={styles.instance} key={instance.instanceId}>
              {(option.children?.length ?? 0) > 0 ? <div className={styles.nested}>
                <SelectionGroups
                  configuration={{ ...configuration, groups: option.children ?? [] }}
                  selection={{ ...selection, groups: instance.children ?? [] }}
                  sources={sources}
                  currency={currency}
                  locale={locale}
                  showPrices={showPrices}
                  createId={createId}
                  depth={depth + 1}
                  onChange={(nested) => setInstances(instances.map((item) => item.instanceId === instance.instanceId
                    ? { ...item, children: nested.groups }
                    : item))}
                  onSelectionProblem={onSelectionProblem}
                />
              </div> : null}
              {hasLinkedChoices && linked && instance.linkedSelection ? <div className={styles.linkedSelection}>
                <SelectionGroups
                  configuration={linked}
                  selection={instance.linkedSelection}
                  sources={sources}
                  currency={currency}
                  locale={locale}
                  showPrices={showPrices}
                  createId={createId}
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
  </section>;
}

export function ProductConfigurator({ restaurantSlug, productId, currency, cartHref, cartCount = 0, initialSelection,
  editingLineId, initialQuantity = 1, maxQuantity = 100, onNetworkQuote, checkoutEnabled = false,
  orderingEnabled = false, showPrices = true, showBottomBar = false, freshStart = false,
  editableQuantity = false, locale = "ar" }: Props) {
  const [envelope, setEnvelope] = useState<PublicProductConfigurationResponse | null>(null);
  const [selection, setSelection] = useState<ProductSelectionV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continueMessage, setContinueMessage] = useState<string | null>(null);
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
    setEnvelope(null);
    setSelection(null);
    setError(null);
    setQuoteAdded(false);
    setStaleEdit(false);
    void getPublicProductConfiguration(restaurantSlug, productId)
      .then((value) => {
        if (cancelled) return;
        const sources = sourceMap(value.linkedProducts);
        const storageKey = `ordersawa:configurator:${restaurantSlug}:${productId}:r${value.configurationRevision}`;
        let initial: ProductSelectionV1 | null = null;
        if (!freshStart) {
          try {
            const stored = window.sessionStorage.getItem(storageKey);
            if (stored) {
              const parsed = JSON.parse(stored) as ProductSelectionV1;
              if (parsed.productId === value.productId && parsed.configurationRevision === value.configurationRevision) initial = parsed;
            }
          } catch {
            // Invalid local preview drafts are ignored without affecting server data.
          }
        }
        setEnvelope(value);
        if (editingLineId && initialSelection) {
          const compatible = initialSelection.productId === value.productId
            && initialSelection.configurationRevision === value.configurationRevision;
          setStaleEdit(!compatible);
          setSelection(compatible ? initialSelection : buildInitialSelection(value.configuration, sources, createId));
        } else {
          setSelection(initial ?? buildInitialSelection(value.configuration, sources, createId));
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
    const storageKey = `ordersawa:configurator:${restaurantSlug}:${productId}:r${envelope.configurationRevision}`;
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
  if (!envelope || !selection || !preview) return <section className={styles.state} dir={locale === "ar" ? "rtl" : "ltr"}><Loader2 className={styles.spin} size={22} /><b>{say(locale, "جارٍ تحميل خيارات الصنف...", "Loading product choices...")}</b></section>;

  async function continuePreview() {
    if (!preview?.valid || preview.total === null) {
      setContinueMessage(say(locale, "أكمل الاختيارات المطلوبة وصحّح الأخطاء أولًا.", "Complete the required choices first."));
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

  const canAdd = orderingEnabled && preview.valid && envelope.orderable && draftQuantity <= maxQuantity && !quoteBusy;
  return <>
    <section className={styles.configurator} dir={locale === "ar" ? "rtl" : "ltr"} data-testid="public-product-configurator">
    <header className={styles.heading}>
      <h2>{say(locale, "تخصيص الصنف", "Customize product")}</h2>
    </header>

    {!envelope.orderable ? <div className={styles.unavailable}><AlertTriangle size={18} /><div><b>{say(locale, "التكوين غير قابل للطلب حاليًا", "This configuration is currently unavailable")}</b></div></div> : null}

    {staleEdit ? <div className={styles.unavailable}><AlertTriangle size={18} /><div><b>{say(locale, "تغيّر تكوين الصنف منذ إضافته للسلة", "Product choices changed since this item was added")}</b><p>{say(locale, "اختيارات السلة القديمة محفوظة دون تعديل. راجع التكوين الحالي واحفظه إذا رغبت.", "Your previous cart choices were not changed. Review and save the current choices if you wish.")}</p></div></div> : null}

    <SelectionGroups
      configuration={envelope.configuration}
      selection={selection}
      sources={sources}
      currency={currency}
      locale={locale}
      showPrices={showPrices}
      createId={createId}
      onChange={(next) => { quoteGate.current.invalidate(); setQuoteBusy(false); setContinueMessage(null); setQuoteAdded(false); setSelection(next); }}
      onSelectionProblem={(label) => setContinueMessage(say(locale,
        `لا يمكن نقل اختيار «${label}» إلى الحجم الجديد. صحّح الاختيار أولًا ثم حاول مجددًا.`,
        `The choice “${label}” is not valid for the new size. Adjust it first, then try again.`))}
    />

    {showPrices ? <aside className={styles.summary} aria-live="polite">
      <div className={styles.summaryTitle}><span>{say(locale, "ملخص السعر", "Price summary")}</span></div>
      {preview.valid && preview.total !== null ? <>
        <ul>{summarizeConfigurationPriceLines(preview.lines, envelope.productName).map((line, index) => <li key={`${line.label}-${index}`}>
          <span dir="auto">{line.label}</span>
          {line.chargedAmount !== undefined ? <b>{displayCurrencyAmount(line.chargedAmount, currency)}</b> : null}
        </li>)}</ul>
        {displayRoundingDifference(preview.lines.map((line) => line.chargedAmount), preview.total, currency)
          ? <p className={styles.hint}>{say(locale, "فرق عرض الأسعار", "Displayed price difference")}: {displayRoundingDifference(preview.lines.map((line) => line.chargedAmount), preview.total, currency)}</p> : null}
        <div className={styles.unitPrice}><span>{say(locale, "سعر القطعة مع الإضافات", "Price per item with choices")}</span><b>{displayCurrencyAmount(preview.total, currency)}</b></div>
        <div className={styles.unitPrice}><span>{say(locale, "الكمية", "Quantity")}</span><b>× {draftQuantity}</b></div>
        <div className={styles.total}><span>{say(locale, "الإجمالي", "Total")}</span><strong>{displayCurrencyAmount(multiplyMoney(preview.total, draftQuantity), currency)}</strong></div>
      </> : <div className={styles.errors}>
        <b>{say(locale, "لا يمكن عرض سعر نهائي بعد", "A final price is not available yet")}</b>
        <ul>{preview.issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${index}`}>{issueText(issue.code, issue.message, locale)}</li>)}</ul>
      </div>}
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
        {quoteBusy ? <Loader2 size={18} className={styles.spin} /> : <ShoppingBag size={18} />}
        <span>{editingLineId ? say(locale, "حفظ التكوين", "Save choices") : say(locale, "إضافة إلى السلة", "Add to cart")}</span>
      </button>
      {cartHref ? <a href={cartHref} className="product-network-cart-shortcut" aria-label={say(locale, "عرض السلة", "View cart")} title={say(locale, "عرض السلة", "View cart")}><ShoppingBag size={20} /><b>{cartCount}</b></a> : null}
    </div> : null}
  </>;
}
