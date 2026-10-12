"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, FlaskConical, Loader2, RefreshCcw, Save, Undo2 } from "lucide-react";
import { validateConfiguration, type ConfigurationGroup, type ConfigurationIssue, type ProductConfigurationV1 } from "@menu/shared";
import { ConfigurationPreview } from "./configuration-preview";
import { ConfigurationWorkspace } from "./configuration-workspace";
import { loadProductConfiguration, saveProductConfiguration, searchRestaurantProducts } from "./api";
import { comboDemo, includedQuantityDemo, pizzaMargheritaDemo, sizeSpecificPricingDemo } from "./demos";
import {
  configurationsEqual,
  draftStorageKey,
  parseDraft,
  prepareDraft,
  serializeDraft
} from "./editor-model";
import { apiErrorMessage, issueMessage } from "./messages";
import type {
  ProductCandidate,
  ProductConfigurationApiError,
  ProductConfigurationDraft,
  ProductConfigurationEnvelope
} from "./types";

type EditorProps = {
  productId: string;
  productName: string;
  currency: string;
  restaurantId: string;
  onSaved?: (envelope: ProductConfigurationEnvelope) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function linkedSourceIds(groups: ConfigurationGroup[], result = new Set<string>()) {
  groups.forEach((group) => {
    const choices = group.type === "SIZE" ? group.sizes : group.options;
    choices.forEach((choice) => {
      if ("linkedProduct" in choice && choice.linkedProduct) {
        result.add(choice.linkedProduct.sourceProductId);
        if (choice.linkedProduct.mode === "CUSTOM" && choice.linkedProduct.customConfiguration) {
          linkedSourceIds(choice.linkedProduct.customConfiguration.groups, result);
        }
      }
      linkedSourceIds(choice.children ?? [], result);
    });
  });
  return result;
}

function hasSize(groups: ConfigurationGroup[]): boolean {
  return groups.some((group) => group.type === "SIZE" || (group.type === "OPTIONS" && group.options.some((option) => hasSize(option.children ?? []))));
}

export function ProductConfigurationEditor(props: EditorProps) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [message, setMessage] = useState("");
  const [serverIssues, setServerIssues] = useState<ConfigurationIssue[]>([]);
  const [envelope, setEnvelope] = useState<ProductConfigurationEnvelope | null>(null);
  const [baseline, setBaseline] = useState<ProductConfigurationV1 | null>(null);
  const [draft, setDraft] = useState<ProductConfigurationDraft | null>(null);
  const [pendingLocalDraft, setPendingLocalDraft] = useState<ProductConfigurationDraft | null>(null);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [sourceConfigurations, setSourceConfigurations] = useState<Map<string, ProductConfigurationEnvelope>>(new Map());
  const sourceRef = useRef(sourceConfigurations);
  sourceRef.current = sourceConfigurations;
  const storageKey = draftStorageKey(props.restaurantId, props.productId);

  const ensureSource = useCallback(async (productId: string) => {
    const existing = sourceRef.current.get(productId);
    if (existing) return existing;
    const loaded = await loadProductConfiguration(productId);
    setSourceConfigurations((current) => new Map(current).set(productId, loaded));
    return loaded;
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading");
    setMessage("");
    try {
      const [nextEnvelope, products] = await Promise.all([
        loadProductConfiguration(props.productId),
        searchRestaurantProducts()
      ]);
      const nextDraft = prepareDraft(nextEnvelope);
      setEnvelope(nextEnvelope);
      setDraft(nextDraft);
      setBaseline(nextDraft.configuration);
      setCandidates(products.filter((product) => product.id !== props.productId));
      const local = parseDraft(window.localStorage.getItem(storageKey), props.productId);
      setPendingLocalDraft(local && !configurationsEqual(local.configuration, nextDraft.configuration) ? local : null);
      setLoadState("ready");
      setSaveState("idle");
      setServerIssues([]);
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل شبكة التكوين.");
    }
  }, [props.productId, storageKey]);

  useEffect(() => { void load(); }, [load]);

  const dirty = Boolean(draft && baseline && !configurationsEqual(draft.configuration, baseline));
  useEffect(() => {
    props.onDirtyChange?.(dirty);
    return () => props.onDirtyChange?.(false);
  }, [dirty, props.onDirtyChange]);
  useEffect(() => {
    if (!draft || !dirty) return;
    const timer = window.setTimeout(() => window.localStorage.setItem(storageKey, serializeDraft({ ...draft, savedAt: new Date().toISOString() })), 350);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, storageKey]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    function protectNavigation(event: MouseEvent) {
      if (!dirty || event.defaultPrevented || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      if (!window.confirm("لديك تغييرات غير محفوظة في شبكة التكوين. هل تريد مغادرة الصفحة؟")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    document.addEventListener("click", protectNavigation, true);
    return () => document.removeEventListener("click", protectNavigation, true);
  }, [dirty]);

  useEffect(() => {
    if (!draft) return;
    linkedSourceIds(draft.configuration.groups).forEach((id) => void ensureSource(id).catch(() => undefined));
  }, [draft, ensureSource]);

  const issues = useMemo(() => draft ? validateConfiguration(draft.configuration) : [], [draft]);
  const displayedIssues = useMemo(() => [...issues, ...serverIssues], [issues, serverIssues]);
  const readOnly = envelope ? !envelope.capability.canWrite : true;

  function changeConfiguration(configuration: ProductConfigurationV1) {
    if (readOnly) return;
    setDraft((current) => current ? { ...current, configuration } : current);
    setSaveState("idle");
    setMessage("");
    setServerIssues([]);
  }

  async function save() {
    if (!draft || issues.length || readOnly) return;
    setSaveState("saving");
    setMessage("");
    const outgoing = { ...draft.configuration, revision: draft.expectedVersion + 1 };
    try {
      const saved = await saveProductConfiguration(props.productId, draft.expectedVersion, outgoing);
      const nextDraft = prepareDraft(saved);
      setEnvelope(saved);
      setDraft(nextDraft);
      setBaseline(nextDraft.configuration);
      window.localStorage.removeItem(storageKey);
      setPendingLocalDraft(null);
      setSaveState("saved");
      setMessage("تم حفظ الشبكة والفهرس المرتبط بها ذريًا.");
      props.onSaved?.(saved);
    } catch (error) {
      const apiError = error as ProductConfigurationApiError;
      setSaveState(apiError?.status === 409 ? "conflict" : "error");
      setMessage(apiErrorMessage(apiError?.status ?? 0, apiError?.code));
      setServerIssues(apiError?.issues ?? []);
      if (apiError?.status === 403) {
        void loadProductConfiguration(props.productId).then((latest) => setEnvelope(latest)).catch(() => undefined);
      }
    }
  }

  async function rebaseAfterConflict() {
    if (!draft) return;
    try {
      const latest = await loadProductConfiguration(props.productId);
      setEnvelope(latest);
      setDraft({ ...draft, expectedVersion: latest.configurationVersion, configuration: { ...draft.configuration, revision: latest.configurationVersion + 1 } });
      setSaveState("idle");
      setMessage("احتفظنا بمسودتك وربطناها بالنسخة الحالية. راجعها ثم احفظ يدويًا.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل النسخة الحالية.");
    }
  }

  function cancel() {
    if (!baseline || !draft) return;
    if (dirty && !window.confirm("سيتم تجاهل تعديلات الشبكة غير المحفوظة. هل تريد المتابعة؟")) return;
    setDraft({ ...draft, configuration: JSON.parse(JSON.stringify(baseline)) as ProductConfigurationV1 });
    window.localStorage.removeItem(storageKey);
    setSaveState("idle");
    setMessage("");
    setServerIssues([]);
  }

  function applyDemo(kind: "pizza" | "included" | "size") {
    if (!draft || !window.confirm("سيستبدل المثال المسودة الحالية محليًا فقط، ولن يُرسل إلى الخادم قبل الضغط على حفظ. متابعة؟")) return;
    const factory = kind === "included" ? includedQuantityDemo : kind === "size" ? sizeSpecificPricingDemo : pizzaMargheritaDemo;
    changeConfiguration(factory(props.productId, draft.expectedVersion + 1));
  }

  async function applyComboDemo() {
    if (!draft || !window.confirm("سيستبدل مثال الكومبو المسودة الحالية محليًا فقط. متابعة؟")) return;
    setSaveState("saving");
    setMessage("جارٍ البحث عن مصدر Network داخل المطعم...");
    try {
      let original: { product: ProductCandidate; envelope: ProductConfigurationEnvelope } | null = null;
      let custom: { product: ProductCandidate; envelope: ProductConfigurationEnvelope } | null = null;
      for (const product of candidates.slice(0, 30)) {
        const source = await ensureSource(product.id);
        custom ??= { product, envelope: source };
        if (!original && source.mode === "NETWORK" && source.configurationTree) original = { product, envelope: source };
        if (original && custom) break;
      }
      if (!original || !custom) throw new Error("لا يوجد مصدر Network مناسب لبناء مثال ORIGINAL في بيانات الاختبار الحالية.");
      changeConfiguration(comboDemo(props.productId, draft.expectedVersion + 1, original, custom));
      setMessage("تم تحميل مثال Combo في المسودة فقط. يتضمن ORIGINAL وCUSTOM وتكرار المصدر.");
      setSaveState("idle");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء مثال الكومبو.");
    }
  }

  if (loadState === "loading") return <section className="pc-shell pc-loading" dir="rtl"><Loader2 className="spin" /><span>جارٍ تحميل شبكة التكوين...</span></section>;
  if (loadState === "error" || !draft || !envelope) return <section className="pc-shell pc-load-error" dir="rtl"><AlertTriangle /><b>{message || "تعذر تحميل المحرر."}</b><button type="button" onClick={() => void load()}><RefreshCcw size={15} /> إعادة المحاولة</button></section>;

  return (
    <section className="pc-shell" dir="rtl" aria-label="محرر شبكة تكوين الصنف">
      <header className="pc-main-header">
        <div><span className="pc-header-icon"><FlaskConical size={23} /></span><div><h2>شبكة تكوين الصنف</h2><p>{props.productName || "الصنف الحالي"} · النسخة الحالية {envelope.configurationVersion} · {envelope.mode === "NETWORK" ? "Network" : "Legacy"}</p></div></div>
        <div className="pc-save-actions">
          {dirty ? <span className="pc-dirty"><CloudOff size={14} /> تغييرات غير محفوظة</span> : <span className="pc-clean"><CheckCircle2 size={14} /> متزامن</span>}
          <button type="button" className="secondary" disabled={!dirty || saveState === "saving"} onClick={cancel}><Undo2 size={16} /> إلغاء</button>
          <button type="button" className="primary" disabled={!dirty || displayedIssues.length > 0 || readOnly || saveState === "saving"} onClick={() => void save()}>{saveState === "saving" ? <Loader2 className="spin" size={16} /> : <Save size={16} />} حفظ الشبكة</button>
        </div>
      </header>

      {pendingLocalDraft ? <div className="pc-draft-banner"><div><b>توجد مسودة محلية غير محفوظة</b><small>حُفظت {new Date(pendingLocalDraft.savedAt).toLocaleString("ar-EG")}. لن تُرسل تلقائيًا.</small></div><span><button type="button" onClick={() => { setDraft(pendingLocalDraft); setPendingLocalDraft(null); }}>استعادة المسودة</button><button type="button" onClick={() => { window.localStorage.removeItem(storageKey); setPendingLocalDraft(null); }}>تجاهلها</button></span></div> : null}
      {!envelope.capability.assigned ? <div className="pc-capability-warning"><AlertTriangle size={18} /><div><b>الميزة غير متاحة في الباقة الحالية</b><p>يمكنك قراءة الشبكة المحفوظة، لكن الحفظ والتفعيل متوقفان. لم تُحذف البيانات ولم يحدث رجوع إلى Base Price.</p></div></div> : null}
      {saveState === "conflict" ? <div className="pc-conflict"><AlertTriangle size={18} /><div><b>تعارض نسخة 409</b><p>{message}</p><button type="button" onClick={() => void rebaseAfterConflict()}>تحميل رقم النسخة الحالية مع إبقاء مسودتي</button><button type="button" onClick={() => void load()}>عرض نسخة الخادم بدلًا منها</button></div></div> : null}
      {message && saveState !== "conflict" ? <p className={`pc-status ${saveState}`}>{message}</p> : null}

      <section className="pc-foundation-card">
        <div><b>Base Price</b><small>القيمة الفارغة تختلف عن الصفر الصريح. وجود أي Size يجعل المحرك يتجاهل Base.</small></div>
        {draft.configuration.basePrice === null ? (
          <div className="pc-null-base"><span>لا يوجد سعر أساسي (null)</span>{!readOnly ? <button type="button" onClick={() => changeConfiguration({ ...draft.configuration, basePrice: "0" })}>إضافة سعر — يبدأ بصفر صريح</button> : null}</div>
        ) : (
          <label><span>السعر الأساسي</span><input inputMode="decimal" disabled={readOnly} value={draft.configuration.basePrice} onChange={(event) => changeConfiguration({ ...draft.configuration, basePrice: event.target.value })} />{!readOnly ? <button type="button" onClick={() => changeConfiguration({ ...draft.configuration, basePrice: null })}>جعله null</button> : null}</label>
        )}
        {hasSize(draft.configuration.groups) ? <p>يوجد Size في الشبكة؛ Base Price لن يدخل في ناتج التسعير.</p> : null}
      </section>

      <section className="pc-demo-bar">
        <div><FlaskConical size={17} /><span><b>أمثلة Demo معزولة</b><small>تملأ المسودة فقط ولا تُنشئ منتجات أو بيانات Production.</small></span></div>
        <span><button type="button" disabled={readOnly} onClick={() => applyDemo("pizza")}>Pizza Margherita</button><button type="button" disabled={readOnly} onClick={() => applyDemo("included")}>Included Quantity</button><button type="button" disabled={readOnly} onClick={() => applyDemo("size")}>Size Pricing</button><button type="button" disabled={readOnly} onClick={() => void applyComboDemo()}>Combo ORIGINAL/CUSTOM</button></span>
      </section>

      {displayedIssues.length ? <section className="pc-validation"><header><AlertTriangle size={17} /><b>أخطاء التحقق ({displayedIssues.length})</b></header><ul>{displayedIssues.map((issue, index) => <li key={`${issue.code}-${issue.path}-${index}`}><b>{issueMessage(issue)}</b><code>{issue.path}</code></li>)}</ul></section> : null}

      <ConfigurationWorkspace
        configuration={draft.configuration}
        onChange={changeConfiguration}
        currentProductId={props.productId}
        candidates={candidates}
        sourceConfigurations={sourceConfigurations}
        ensureSource={ensureSource}
        readOnly={readOnly}
      />
      <ConfigurationPreview configuration={draft.configuration} currency={props.currency} restaurantId={props.restaurantId} sources={sourceConfigurations} />
    </section>
  );
}
