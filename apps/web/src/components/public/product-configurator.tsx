"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
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
  linkedConfiguration,
  LatestQuoteGate,
  updateOptionGroup
} from "./product-configurator-model";
import styles from "./product-configurator.module.css";
import { displayCurrencyAmount, displayRoundingDifference } from "@/lib/currency-display";

type Props = {
  restaurantSlug: string;
  productId: string;
  currency: string;
  cartHref?: string;
  initialSelection?: ProductSelectionV1 | null;
  editingLineId?: string;
  onNetworkQuote?: (quote: PublicProductQuoteResponse, editingLineId?: string) => boolean;
  checkoutEnabled?: boolean;
};

function issueText(code: string, fallback: string) {
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
  return messages[code] ?? fallback;
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
  createId,
  onChange,
  depth = 0
}: {
  configuration: ProductConfigurationV1;
  selection: ProductSelectionV1;
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>;
  currency: string;
  createId: (prefix: string) => string;
  onChange: (selection: ProductSelectionV1) => void;
  depth?: number;
}) {
  return <div className={styles.groups} data-depth={depth}>{configuration.groups.map((group) => {
    if (group.type === "SIZE") {
      const selected = groupSelection(selection, group.id) as SizeGroupSelection | undefined;
      const selectedSize = group.sizes.find((size) => size.id === selected?.sizeChoiceId);
      return <section className={styles.group} key={group.id} data-group-type="SIZE">
        <header className={styles.groupHeader}>
          <div><b>{group.label}</b><span className={styles.required}>مطلوب</span></div>
          <small>اختر حجمًا واحدًا</small>
        </header>
        <div className={styles.sizeGrid} role="radiogroup" aria-label={group.label}>
          {group.sizes.map((size) => <button
            type="button"
            role="radio"
            aria-checked={selected?.sizeChoiceId === size.id}
            className={selected?.sizeChoiceId === size.id ? styles.selected : ""}
            disabled={size.available === false}
            key={size.id}
            onClick={() => onChange(replaceGroup(selection, {
              type: "SIZE",
              groupId: group.id,
              sizeChoiceId: size.id,
              children: buildInitialSelection(
                { ...configuration, groups: size.children ?? [] },
                sources,
                createId
              ).groups
            }))}
          >
            <span>{size.label}</span>
            <strong>{displayCurrencyAmount(size.price, currency)}</strong>
          </button>)}
        </div>
        {selectedSize && selected && (selectedSize.children?.length ?? 0) > 0 ? <div className={styles.nested}>
          <SelectionGroups
            configuration={{ ...configuration, groups: selectedSize.children ?? [] }}
            selection={{ ...selection, groups: selected.children ?? [] }}
            sources={sources}
            currency={currency}
            createId={createId}
            depth={depth + 1}
            onChange={(nested) => onChange(replaceGroup(selection, { ...selected, children: nested.groups }))}
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
      createId={createId}
      depth={depth}
      onChange={onChange}
    />;
  })}</div>;
}

function OptionGroup({
  group,
  configuration,
  selection,
  sources,
  currency,
  createId,
  depth,
  onChange
}: {
  group: Extract<ConfigurationGroup, { type: "OPTIONS" }>;
  configuration: ProductConfigurationV1;
  selection: ProductSelectionV1;
  sources: ReadonlyMap<string, PublicLinkedConfigurationSource>;
  currency: string;
  createId: (prefix: string) => string;
  depth: number;
  onChange: (selection: ProductSelectionV1) => void;
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
        <b>{group.label}</b>
        <span className={group.min > 0 ? styles.required : styles.optional}>{group.min > 0 ? "مطلوب" : "اختياري"}</span>
      </div>
      <small>المحدد {instances.length} · الحد {group.min}–{group.max ?? 100}{group.includedQuantity ? ` · المشمول ${group.includedQuantity}` : ""}</small>
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
        const priceHint = option.priceOverrides?.length ? "يتغير حسب الحجم" : option.price;

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
              <span><b>{option.label}</b><small>{priceHint === option.price ? displayCurrencyAmount(option.price, currency) : priceHint}</small></span>
            </button>
            {option.maxQuantity > 1 ? <div className={styles.quantity}>
              <button type="button" onClick={remove} disabled={!canRemove} aria-label={`تقليل ${option.label}`}><Minus size={14} /></button>
              <strong>{count}</strong>
              <button type="button" onClick={add} disabled={!canAdd} aria-label={`زيادة ${option.label}`}><Plus size={14} /></button>
            </div> : null}
          </div>
          {option.linkedProduct ? <div className={styles.linkedMeta}>
            <span>{option.linkedProduct.mode}</span>
            <b>{source?.name ?? "مصدر غير متاح"}</b>
            {source && !source.orderable ? <small>غير قابل للطلب حاليًا</small> : null}
          </div> : null}
          {optionInstances.map((instance, index) => {
            const linked = linkedConfiguration(option, sources);
            return <div className={styles.instance} key={instance.instanceId}>
              {optionInstances.length > 1 ? <div className={styles.instanceTitle}>الوحدة {index + 1} · تكوين مستقل</div> : null}
              {(option.children?.length ?? 0) > 0 ? <div className={styles.nested}>
                <SelectionGroups
                  configuration={{ ...configuration, groups: option.children ?? [] }}
                  selection={{ ...selection, groups: instance.children ?? [] }}
                  sources={sources}
                  currency={currency}
                  createId={createId}
                  depth={depth + 1}
                  onChange={(nested) => setInstances(instances.map((item) => item.instanceId === instance.instanceId
                    ? { ...item, children: nested.groups }
                    : item))}
                />
              </div> : null}
              {linked && instance.linkedSelection ? <div className={styles.linkedSelection}>
                <div className={styles.linkedHeading}><ChevronDown size={15} /><b>اختيارات {source?.name ?? option.label}</b></div>
                <SelectionGroups
                  configuration={linked}
                  selection={instance.linkedSelection}
                  sources={sources}
                  currency={currency}
                  createId={createId}
                  depth={depth + 1}
                  onChange={(linkedSelection) => setInstances(instances.map((item) => item.instanceId === instance.instanceId
                    ? { ...item, linkedSelection }
                    : item))}
                />
              </div> : null}
            </div>;
          })}
        </article>;
      })}
    </div>
  </section>;
}

export function ProductConfigurator({ restaurantSlug, productId, currency, cartHref, initialSelection, editingLineId, onNetworkQuote, checkoutEnabled = false }: Props) {
  const [envelope, setEnvelope] = useState<PublicProductConfigurationResponse | null>(null);
  const [selection, setSelection] = useState<ProductSelectionV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continueMessage, setContinueMessage] = useState<string | null>(null);
  const [quoteAdded, setQuoteAdded] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [staleEdit, setStaleEdit] = useState(false);
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
        try {
          const stored = window.sessionStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored) as ProductSelectionV1;
            if (parsed.productId === value.productId && parsed.configurationRevision === value.configurationRevision) initial = parsed;
          }
        } catch {
          // Invalid local preview drafts are ignored without affecting server data.
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
  }, [productId, restaurantSlug, editingLineId]);

  useEffect(() => {
    if (!envelope || !selection) return;
    const storageKey = `ordersawa:configurator:${restaurantSlug}:${productId}:r${envelope.configurationRevision}`;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(selection));
    } catch {
      // Local draft persistence is optional and must never block configuration.
    }
  }, [envelope, productId, restaurantSlug, selection]);

  const sources = useMemo(() => sourceMap(envelope?.linkedProducts ?? []), [envelope]);
  const preview = useMemo(
    () => envelope && selection ? calculatePublicPreview(envelope, restaurantSlug, selection) : null,
    [envelope, restaurantSlug, selection]
  );

  if (error) return <section className={styles.state} dir="rtl"><AlertTriangle size={22} /><b>{error}</b></section>;
  if (!envelope || !selection || !preview) return <section className={styles.state} dir="rtl"><Loader2 className={styles.spin} size={22} /><b>جارٍ تحميل خيارات الصنف...</b></section>;

  function reset() {
    quoteGate.current.invalidate();
    setQuoteBusy(false);
    idCounter.current = 0;
    setContinueMessage(null);
    setQuoteAdded(false);
    setSelection(buildInitialSelection(envelope!.configuration, sources, createId));
  }

  async function continuePreview() {
    if (!preview?.valid || preview.total === null) {
      setContinueMessage("أكمل الاختيارات المطلوبة وصحّح الأخطاء أولًا.");
      return;
    }
    if (!envelope?.orderable || !selection || !onNetworkQuote) {
      setContinueMessage("لا يمكن حفظ هذا التكوين في السلة حاليًا.");
      return;
    }
    const requestId = quoteGate.current.next();
    setQuoteBusy(true);
    setContinueMessage(null);
    setQuoteAdded(false);
    try {
      const quote = await getPublicProductQuote(restaurantSlug, productId, selection);
      if (!quoteGate.current.isCurrent(requestId)) return;
      if (!onNetworkQuote(quote, editingLineId)) {
        setContinueMessage("استجابة السعر غير متوافقة مع الصنف الحالي؛ لم تُعدَّل السلة.");
        return;
      }
      setContinueMessage(editingLineId ? "حُفظ التكوين المعدّل في السلة. السعر الحالي قابل للتغير." : "أُضيف التكوين إلى السلة بسعر Quote حالي قابل للتغير.");
      setQuoteAdded(true);
      setStaleEdit(false);
    } catch (error) {
      if (!quoteGate.current.isCurrent(requestId)) return;
      if (error instanceof PublicProductQuoteError) {
        const firstIssue = error.issues[0];
        setContinueMessage(firstIssue ? issueText(firstIssue.code, firstIssue.message) : error.message);
      } else {
        setContinueMessage("تعذر الاتصال بخدمة السعر؛ لم تُضف إلى السلة.");
      }
    } finally {
      if (quoteGate.current.isCurrent(requestId)) setQuoteBusy(false);
    }
  }

  return <section className={styles.configurator} dir="rtl" data-testid="public-product-configurator">
    <header className={styles.heading}>
      <div><span>تخصيص الصنف</span><h2>{envelope.productName}</h2></div>
      <button type="button" onClick={reset}><RotateCcw size={15} /> إعادة الضبط</button>
    </header>

    {!envelope.orderable ? <div className={styles.unavailable}><AlertTriangle size={18} /><div><b>التكوين غير قابل للطلب حاليًا</b><p>لن نخفّض المتطلبات أو نعرض سعرًا نهائيًا غير موثوق.</p></div></div> : null}

    {staleEdit ? <div className={styles.unavailable}><AlertTriangle size={18} /><div><b>تغيّر إصدار التكوين منذ إضافته للسلة</b><p>اختيارات السلة القديمة محفوظة دون تعديل. راجع التكوين الحالي واحفظه صراحةً إذا رغبت.</p></div></div> : null}

    <SelectionGroups
      configuration={envelope.configuration}
      selection={selection}
      sources={sources}
      currency={currency}
      createId={createId}
      onChange={(next) => { quoteGate.current.invalidate(); setQuoteBusy(false); setContinueMessage(null); setQuoteAdded(false); setSelection(next); }}
    />

    <aside className={styles.summary} aria-live="polite">
      <div className={styles.summaryTitle}><span>ملخص السعر</span><small>معاينة فقط</small></div>
      {preview.valid && preview.total !== null ? <>
        <div className={styles.total}><span>الإجمالي الحالي</span><strong>{displayCurrencyAmount(preview.total, currency)}</strong></div>
        <ul>{preview.lines.map((line, index) => <li key={`${line.path}-${index}`}>
          <span>{line.label}{line.included ? " · مشمول" : ""}{line.instanceId ? " · وحدة مستقلة" : ""}</span>
          <b>{displayCurrencyAmount(line.chargedAmount, currency)}</b>
        </li>)}</ul>
        {displayRoundingDifference(preview.lines.map((line) => line.chargedAmount), preview.total, currency)
          ? <p className={styles.hint}>فرق عرض التقريب: {displayRoundingDifference(preview.lines.map((line) => line.chargedAmount), preview.total, currency)}</p> : null}
        {preview.baseIgnored ? <p className={styles.hint}>تم تجاهل السعر الأساسي لأن التكوين يحتوي على أحجام كاملة السعر.</p> : null}
      </> : <div className={styles.errors}>
        <b>لا يمكن عرض سعر نهائي بعد</b>
        <ul>{preview.issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${index}`}>{issueText(issue.code, issue.message)}</li>)}</ul>
      </div>}
    </aside>

    <div className={styles.previewGate}>
      <button type="button" onClick={() => void continuePreview()} disabled={quoteBusy || !preview.valid || !envelope.orderable}>
        {quoteBusy ? "جارٍ التحقق من السعر..." : editingLineId ? "حفظ التكوين في السلة" : "تحقق وأضف إلى السلة"}
      </button>
      <p>{checkoutEnabled
        ? "الإضافة تستخدم سعرًا موثوقًا من الخادم؛ ستراجع السعر والتوفر مجددًا قبل فتح WhatsApp."
        : "السعر الظاهر أعلاه معاينة محلية؛ الإضافة تستخدم Quote من الخادم. السلة للتجربة فقط ولا تتيح إرسال طلب Network الآن."}</p>
      {continueMessage ? <strong>{continueMessage}</strong> : null}
      {cartHref && quoteAdded ? <a href={cartHref}>عرض السلة</a> : null}
    </div>
  </section>;
}
