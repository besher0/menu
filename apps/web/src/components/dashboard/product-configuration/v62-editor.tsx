"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateConfigurationV2, validateConfigurationCurrencyV2, validateGroupLevelsV2, type ProductConfigurationV2 as Config,
  type ProductEditorAggregate, type ConfigurationIssue } from "@menu/shared";
import { ConfigurationTree } from "./v62-tree";
import { Inspector, type Candidate } from "./v62-inspector";
import { copy, createOption, createSize, deleteNode, emptyConfiguration, insertGroup, issueNode, keyOf, locate,
  moveNode, pricingContext, updateNode, attachLinked, walk, type Ref, type SourceMap, type Destination } from "./v62-model";
import { configurationEditorIssues } from "./configuration-editor-errors";
import { DraftConfiguratorPreview } from "./draft-configurator-preview";
import type { CSSProperties } from "react";
import styles from "./v62-editor.module.css";

export type V62EditorProps = {
  productId: string; restaurantId: string; currency: string; basePrice: string | null;
  productName?: string; previewStyle?: CSSProperties; serverIssues?: Array<{code?:string;path:string;message:string}>;
  configuration: Config | null; onChange: (value: Config) => void;
  canManage: boolean; assigned: boolean; pending: boolean; validationAttempt: number;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  onSources: (sources: SourceMap) => void;
  onValidity: (issues: ConfigurationIssue[], loading: boolean) => void;
};
export function ProductConfigurationEditor(props: V62EditorProps) {
  const [selected, setSelected] = useState<Ref | null>(null), [sources, setSources] = useState<Map<string, ProductEditorAggregate>>(new Map());
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(0), [message, setMessage] = useState("");
  const [deletion, setDeletion] = useState<Ref | null>(null);
  const root = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  const latest = useRef(props); latest.current = props;
  const cache = useRef(new Map<string, ProductEditorAggregate>()), inFlight = useRef(new Map<string, Promise<ProductEditorAggregate>>());
  const epoch = useRef(0);
  const graph = useRef(new Map<string, string[]>());
  const linkRequests = useRef(new Map<string, number>());
  const readOnly = !props.canManage || !props.assigned || props.pending;
  const unwrap = async (response: Response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "تعذر تحميل المصدر المسموح.");
    return body.data ?? body;
  };
  const ensureSource = useCallback(async function ensure(id: string, stack: string[] = []): Promise<ProductEditorAggregate> {
    if (!id || id === latest.current.productId || stack.includes(id)) throw new Error("الربط ينشئ دورة أو يستخدم معرّفًا غير صالح.");
    if (cache.current.has(id)) return cache.current.get(id)!;
    if (inFlight.current.has(id)) {
      return inFlight.current.get(id)!;
    }
    const generation = epoch.current;
    setLoading(n => n + 1);
    const promise = (async () => {
      const source = await unwrap(await latest.current.request("/dashboard/products/" + encodeURIComponent(id) + "/editor")) as ProductEditorAggregate;
      if (source.id !== id || epoch.current !== generation) throw new Error("تغيّر سياق المطعم؛ أعد فتح المنتج.");
      graph.current.set(id, source.dependencies.map(x => x.sourceProductId));
      const checked = new Set<string>();
      const verify = (current: string, ancestors = new Set<string>()) => {
        if (current === latest.current.productId || ancestors.has(current)) throw new Error("المصدر ينشئ دورة Linked.");
        if (checked.has(current)) return;
        if (checked.size > 1000) throw new Error("تجاوز عدد مصادر Linked حد المحرر.");
        const next = new Set(ancestors).add(current);
        for (const target of graph.current.get(current) ?? []) verify(target, next);
        checked.add(current);
      };
      verify(id);
      for (const edge of source.dependencies) {
        if (epoch.current !== generation) throw new Error("تغيّر سياق المطعم.");
        if (edge.sourceProductId === latest.current.productId || [...stack, id].includes(edge.sourceProductId)) throw new Error("هذا المصدر يعتمد على المنتج الحالي أو ينشئ دورة.");
        await ensure(edge.sourceProductId, [...stack, id]);
      }
      if (epoch.current !== generation) throw new Error("تغيّر سياق المطعم.");
      cache.current.set(id, source); setSources(new Map(cache.current)); return source;
    })();
    inFlight.current.set(id, promise);
    try { return await promise; } finally { if (epoch.current === generation) { inFlight.current.delete(id); setLoading(n => n - 1); } }
  }, []);
  useEffect(() => {
    epoch.current++; cache.current = new Map(); inFlight.current = new Map(); graph.current = new Map(); linkRequests.current = new Map();
    setSources(new Map()); setLoading(0); setSelected(null);
    return () => { epoch.current++; };
  }, [props.restaurantId, props.productId]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // The native reference selector contains the full tenant-scoped catalog.
        const p = new URLSearchParams({ sort: "sortOrder" });
        const data = await unwrap(await latest.current.request("/dashboard/products?" + p));
        if (!cancelled) setCandidates((Array.isArray(data) ? data : data.data ?? []).filter((x: Candidate) => x.id !== latest.current.productId));
      } catch (error) { if (!cancelled) setMessage((error as Error).message); }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [props.restaurantId]);
  useEffect(() => {
    if (!props.configuration) return;
    const ids = new Set<string>();
    walk(props.configuration, x => { if ("maxQuantity" in x.node && x.node.linkedProduct?.sourceProductId) ids.add(x.node.linkedProduct.sourceProductId); });
    for (const id of ids) if (!cache.current.has(id) && !inFlight.current.has(id)) void ensureSource(id).catch(e => setMessage(e.message));
  }, [props.configuration, ensureSource]);
  useEffect(() => { props.onSources(sources); }, [sources, props.onSources]);
  const issues = useMemo(() => {
    const config = props.configuration;
    if (!config) return [];
    const result = validateConfigurationV2(config);
    if (!result.length) result.push(...validateConfigurationCurrencyV2(config, props.currency));
    if (!result.length) result.push(...validateGroupLevelsV2(config, id => sources.get(id)?.configuration ?? undefined));
    return result;
  }, [props.configuration, props.currency, sources]);
  const callbacks = useRef(props); callbacks.current = props;
  useEffect(() => { callbacks.current.onValidity(issues, loading > 0); }, [issues, loading]);
  const select = (ref: Ref) => {
    previousFocus.current = document.activeElement as HTMLElement;
    setSelected(ref);
  };
  const focusIssue = useCallback((issue: ConfigurationIssue) => {
    const config = latest.current.configuration;
    const ref = config && issueNode(config, issue.path);
    if (!ref) return;
    setSelected(ref);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[data-v62-node="' + CSS.escape(keyOf(ref)) + '"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, []);
  useEffect(() => { if (props.validationAttempt && issues[0]) focusIssue(issues[0]); }, [props.validationAttempt, focusIssue]);
  useEffect(() => {
    if (deletion) dialog.current?.showModal(); else if (dialog.current?.open) dialog.current.close();
  }, [deletion]);
  const attempt = (change: () => void) => { try { change(); setMessage(""); } catch (e) { setMessage((e as Error).message); } };
  const config = props.configuration;
  const displayedIssues = configurationEditorIssues(config,[...issues,...(props.serverIssues??[])]);
  const previewSources = useMemo(() => [...sources.values()].map(source => ({productId:source.id,slug:source.id,name:source.product.name,currency:source.currency,
    configurationRevision:source.configurationVersion,mode:source.configuration?"NETWORK" as const:"LEGACY" as const,
    available:(candidates.find(x=>x.id===source.id) as Candidate & {isAvailable?:boolean})?.isAvailable!==false,
    orderable:(candidates.find(x=>x.id===source.id) as Candidate & {isAvailable?:boolean})?.isAvailable!==false,
    configuration:source.configuration??emptyConfiguration(source.id,source.product.basePrice)})),[sources,candidates]);
  const close = () => { setSelected(null); previousFocus.current?.focus(); };
  const deleteTarget = config && deletion ? locate(config, deletion) : null;
  const deleteTitle = deleteTarget?.kind === "group" ? ("type" in deleteTarget.node && deleteTarget.node.type === "SIZE" ? "حذف الأحجام" : "حذف الخيارات") : deleteTarget?.kind === "size" ? "حذف الحجم" : "حذف الخيار";
  const cancelDelete = () => { setDeletion(null); previousFocus.current?.focus(); };
  const addGroup = (destination: Destination, type: "SIZE" | "OPTIONS") => attempt(() => {
    if (readOnly) return;
    const added = insertGroup(config ?? emptyConfiguration(props.productId, props.basePrice), destination, type);
    const levels = validateGroupLevelsV2(added.configuration, id => sources.get(id)?.configuration ?? undefined);
    if (levels.length) throw new Error("لا يسمح بأكثر من ثلاثة مستويات مجموعات أو أحجام داخل أحجام.");
    props.onChange(added.configuration); select(added.ref);
  });
  return <><section ref={root} className={styles.editor} aria-label="محرر Product Configuration V62" data-v62-editor>
    <header className="config-section-head"><h3>شبكة الخيارات والأحجام</h3>{<div className="config-builder-actions">
      <button type="button" className="config-mini-btn" disabled={readOnly} onClick={() => addGroup({path:[],container:"root",index:config?.groups.length ?? 0},"OPTIONS")}>+ خيارات</button>
      <button type="button" className="config-mini-btn" disabled={readOnly} onClick={() => addGroup({path:[],container:"root",index:config?.groups.length ?? 0},"SIZE")}>+ أحجام</button>
    </div>}</header>
    {!config ? <>
      <div className="config-builder-shell"><div className="config-tree-panel"><p className="config-empty">لا توجد خطوات بعد.</p></div><aside className="config-drawer"><p className="config-drawer-empty">اختر عنصرًا من الشبكة.</p></aside></div>
      {!props.canManage && <p>ليس لهذا الدور صلاحية إدارة التكوين.</p>}
      {props.canManage && !props.assigned && <p>تحتاج شبكة التكوين إلى القدرة المسندة للمطعم.</p>}
    </> : <>
      <div className="config-builder-shell">
        <div>
          <ConfigurationTree configuration={config} sources={sources} selected={selected} restaurantId={props.restaurantId} currency={props.currency}
            readOnly={readOnly} onError={setMessage} actions={{
              onSelect: ref => ref ? select(ref) : close(),
              onAdd: addGroup,
              onChoice: ref => attempt(() => {
                const group = locate(config, ref)?.node;
                if (!group || !("type" in group)) return;
                const choice = group.type === "SIZE" ? createSize() : createOption();
                props.onChange(updateNode(config, ref, n => { if ("type" in n) (n.type === "SIZE" ? n.sizes : n.options).push(choice as never); }));
                select({ id: choice.id, path: ref.path });
              }),
              onDelete: ref => { setDeletion(ref); previousFocus.current = document.activeElement as HTMLElement; },
              onStar: ref => props.onChange(updateNode(config, ref, node => {
                if ("highlightInPriceSummary" in node || "type" in node || "maxQuantity" in node) {
                  if (!("type" in node && node.hidePublicLabel)) Object.assign(node, { highlightInPriceSummary: !(node as { highlightInPriceSummary?: boolean }).highlightInPriceSummary });
                }
              })),
              onMove: (ref, target) => attempt(() => { props.onChange(moveNode(config, ref, target, sources)); })
            }} />
          <div className="config-live" role="status" aria-live="polite">{loading > 0 ? "جارٍ تحميل الأصناف المرتبطة…" : message && (/configuration\.|Error|Exception|\$/.test(message) ? "تعذر تعديل هذا العنصر. راجع بياناته ثم حاول مجددًا." : message)}</div>
        </div>
        <div><Inspector configuration={config} selected={selected} sources={sources} candidates={candidates}
          restaurantId={props.restaurantId} currency={props.currency} readOnly={readOnly} onChange={props.onChange} onClose={close}
          onLink={async (ref, sourceId, mode) => {
            if (!sourceId) return;
            const key = keyOf(ref), generation = (linkRequests.current.get(key) ?? 0) + 1;
            linkRequests.current.set(key, generation);
            try {
              const source = await ensureSource(sourceId);
              if (linkRequests.current.get(key) !== generation || !latest.current.configuration || !locate(latest.current.configuration, ref)) return;
              const current = locate(latest.current.configuration, ref)!.node;
              if (!latest.current.canManage || !latest.current.assigned || !("maxQuantity" in current) || !current.linkedProduct) return;
              latest.current.onChange(attachLinked(latest.current.configuration, ref, source, mode)); setMessage("");
            } catch (error) { setMessage((error as Error).message); }
          }} />
        </div>
      </div>

    </>}
    <dialog ref={dialog} className="config-modal" dir="rtl" aria-labelledby="v62-delete-title" onCancel={e => { e.preventDefault(); e.stopPropagation(); setDeletion(null); }}>
      <div className="config-modal-head"><div><h3 id="v62-delete-title">{deleteTitle}</h3><div className="config-modal-subtle">لا يمكن التراجع عن هذا الإجراء داخل المسودة بعد تأكيده.</div></div><button type="button" className="config-dialog-button config-dialog-close" aria-label="إغلاق تأكيد الحذف" onClick={cancelDelete}>×</button></div>
      <div className="config-modal-body"><p style={{padding:"4px 0",lineHeight:1.8}}>{deleteTarget?.kind === "group" ? "سيتم حذف هذه الخطوة وكل ما يتبعها." : deleteTarget?.kind === "size" ? "سيتم حذف هذا الحجم." : "سيتم حذف هذا الخيار وكل ما يتبعه."}</p></div>
      <div className="config-modal-foot"><button type="button" aria-label="تأكيد الحذف" className="config-dialog-button danger" onClick={() => {
        if (config && deletion) attempt(() => {
          const next = deleteNode(config, deletion); props.onChange(next);
          if (selected && (!locate(next, selected.original ? { id: selected.original.owner, path: selected.path } : selected))) close();
        });
        setDeletion(null);
      }}>حذف</button><button type="button" className="config-dialog-button" onClick={cancelDelete}>إلغاء</button></div>
    </dialog>
  </section>
    <DraftConfiguratorPreview configuration={config} name={props.productName??""} currency={props.currency} sources={previewSources}
      issues={issues} themeStyle={props.previewStyle} />
    {displayedIssues.length>0&&<div className={styles.editor}><div className="config-errors" role="alert"><b>يرجى إكمال إعدادات الصنف قبل الحفظ</b>
      {displayedIssues.map((issue,i)=><button type="button" key={i} onClick={()=>focusIssue({code:issue.code,path:issue.path,message:issue.message})}>
        <strong>{issue.label}</strong>: {issue.message}
      </button>)}
    </div></div>}

  </>;
}
