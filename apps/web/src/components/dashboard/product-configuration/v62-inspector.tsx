"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Star } from "lucide-react";
import type { ProductConfigurationV2 as Config, SizeGroupV2, OptionChoiceV2 as Option, LocalPrice } from "@menu/shared";
import { locate, updateNode, originalView, type Ref, type SourceMap, type Node } from "./v62-model";

function IncludedQuantityTip() {
  const trigger=useRef<HTMLSpanElement>(null),tip=useRef<HTMLSpanElement>(null);
  const [open,setOpen]=useState(false);
  useEffect(()=>{const hide=()=>setOpen(false);window.addEventListener("resize",hide);document.addEventListener("scroll",hide,true);
    return()=>{window.removeEventListener("resize",hide);document.removeEventListener("scroll",hide,true);};},[]);
  useEffect(()=>{if(!open || !trigger.current || !tip.current)return;
    const r=trigger.current.getBoundingClientRect(),el=tip.current,w=Math.min(300,window.innerWidth-24);
    el.style.width=w+"px";el.style.left=Math.max(12,Math.min(window.innerWidth-w-12,r.right-w))+"px";
    el.style.top="0px";const h=el.offsetHeight;
    el.style.top=(r.bottom+7+h>window.innerHeight-10?Math.max(10,r.top-h-7):r.bottom+7)+"px";
  },[open]);
  return <><span ref={trigger} className="config-info-tip" tabIndex={0} role="button" aria-label="معلومات عن الكمية المشمولة مجانًا" aria-expanded={open}
    onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)}
    onClick={()=>setOpen(true)} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setOpen(false);}}}>!</span>
    {open && <span ref={tip} role="tooltip" className="config-tooltip-portal show">حدّد عدد الوحدات التي تكون مشمولة مجانًا من هذه الخيارات. إذا اختار الزبون أكثر من هذا العدد، تُحتسب الوحدات الإضافية حسب أسعارها. وعند اختلاف الأسعار، تعتبر أعلى الوحدات سعرًا ضمن العدد المجاني هي المشمولة مجانًا.<b>مثال: الكمية المشمولة مجانًا = 2، واختار الزبون إضافات أسعارها 5 و3 و1. تصبح الإضافتان بسعر 5 و3 مجانًا، ويُحسب عليه فقط سعر الإضافة 1.</b></span>}</>;
}
export type Candidate = { id: string; name: string; configurationMode: "LEGACY" | "NETWORK" };
export function PriceFields({ node, scopes, onChange, sourcePrice }: {
  node: { price: string; priceBySize?: Option["priceBySize"] }; scopes: SizeGroupV2[];
  onChange: (value: LocalPrice) => void; sourcePrice?: string;
}) {
  const selected = scopes.find(x => x.id === node.priceBySize?.sizeGroupId);
  return <>
    <label>السعر الثابت {scopes.length ? "(والافتراضي عند ترك سعر حجم فارغ)" : ""}
      <input aria-label="السعر الثابت" inputMode="decimal" value={node.price} onChange={e => onChange({ ...node, price: e.target.value })} />
    </label>
    {sourcePrice !== undefined && <small className="config-source-reference">سعر المصدر {sourcePrice} — مرجعي فقط، لا يُضاف تلقائيًا.</small>}
    {scopes.length > 0 && <div className="os66-size-price-panel">
      <label>طريقة التسعير<select aria-label="طريقة التسعير" value={node.priceBySize ? "by-size" : "fixed"} onChange={e => onChange(e.target.value === "fixed"
        ? { price: node.price } : { ...node, priceBySize: { sizeGroupId: scopes.length === 1 ? scopes[0].id : "", overrides: {} } })}>
        <option value="fixed">سعر ثابت</option><option value="by-size">سعر حسب الحجم المرتبط</option>
      </select></label>
      {node.priceBySize && (scopes.length > 1 || !selected) && <label>مجموعة الأحجام التابعة لهذا الخيار
        <select aria-label="مجموعة الأحجام التابعة لهذا الخيار" value={node.priceBySize.sizeGroupId} onChange={e => onChange({
          ...node, priceBySize: { sizeGroupId: e.target.value, overrides: {} }
        })}><option value="">— اختر مجموعة الأحجام —</option>{scopes.map(s => <option key={s.id} value={s.id}>{s.hidePublicLabel ? "أحجام بدون عنوان" : s.label}</option>)}</select>
      </label>}
      {node.priceBySize && !selected && <p role="alert">اختر مجموعة الأحجام المؤهلة صراحةً.</p>}
      {node.priceBySize && selected && <>
        <div className="os66-size-price-grid">{selected.sizes.map(size => <label key={size.id}>
          {size.label || "حجم بلا اسم"}<input inputMode="decimal" aria-label={"سعر " + (size.label || "حجم بلا اسم")}
            placeholder={"الثابت: " + node.price} value={node.priceBySize!.overrides[size.id] ?? ""}
            onChange={e => onChange({ ...node, priceBySize: { ...node.priceBySize!, overrides: {
              ...node.priceBySize!.overrides, [size.id]: e.target.value === "" ? null : e.target.value
            } } })} />
        </label>)}</div>
        <p className="config-source-reference">الحقل الفارغ يستخدم السعر الثابت؛ 0 سعر صفر صريح. النطاق لا يعبر إلى منتج مرتبط آخر.</p>
      </>}
    </div>}
  </>;
}
export function Inspector({ configuration, selected, sources, candidates, restaurantId, currency, readOnly, onChange, onClose, onLink }: {
  configuration: Config; selected: Ref | null; sources: SourceMap; candidates: Candidate[]; restaurantId: string; currency: string;
  readOnly: boolean; onChange: (next: Config) => void; onClose: () => void; onLink: (ref: Ref, sourceId: string, mode: "ORIGINAL" | "CUSTOM") => Promise<void>;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected && window.matchMedia("(max-width:980px)").matches) {
      element.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected?.id, JSON.stringify(selected?.path)]);
  const local = selected && !selected.original ? locate(configuration, selected) : undefined;
  const owner = selected?.original ? { id: selected.original.owner, path: selected.path } : null;
  const tree = selected?.original ? originalView(configuration, selected, sources, restaurantId, currency) : null;
  const sourceLocation = selected && tree ? locate(tree, { id: selected.id, path: [] }) : undefined;
  const loc = local ?? sourceLocation;
  const node = loc?.node;
  const original = !!owner;
  const nestedOriginal = !!selected?.original?.linkedPath?.length;
  const change = (mutate: (value: Node) => void) => {
    if (selected && !original && !readOnly) onChange(updateNode(configuration, selected, mutate));
  };
  const setPrice = (price: LocalPrice) => {
    if (readOnly || nestedOriginal || !selected) return;
    if (!owner) change(n => { if (!("type" in n)) {
      n.price = price.price;
      if ("maxQuantity" in n) { if (price.priceBySize) n.priceBySize = price.priceBySize; else delete n.priceBySize; }
    } });
    else onChange(updateNode(configuration, owner, n => {
      if ("maxQuantity" in n && n.linkedProduct?.mode === "ORIGINAL") n.linkedProduct.originalPriceOverrides = {
        ...n.linkedProduct.originalPriceOverrides, [selected.id]: price
      };
    }));
  };
  const title = !loc ? "خصائص التكوين" : loc.kind === "group" ? "type" in node! && node.type === "SIZE" ? "إعدادات الأحجام" : "إعدادات الخيارات"
    : loc.kind === "size" ? "إعدادات الحجم" : "إعدادات الخيار";
  const label = (text: string, value: string | number, onChangeValue: (v: string) => void, props: { disabled?: boolean; placeholder?: string; type?: string } = {}) =>
    <label>{text}<input aria-label={text} value={value} {...props} onChange={e => onChangeValue(e.target.value)} /></label>;
  const quantity = (text: string, value: number | null | undefined, field: string, nullable = false) =>
    label(text, value ?? "", value => change(n => Object.assign(n, { [field]: nullable && value === "" ? null : Number(value) })),
      { type: "number", placeholder: nullable ? "بدون حد" : "0", disabled: original });
  let fields: ReactNode = <p className="config-drawer-empty">اختر عنصرًا من الشبكة.</p>;
  if (loc && node) {
    if ("type" in node) fields = <>
      {label(node.type === "SIZE" ? "اسم خطوة الأحجام" : "اسم الخيارات", node.hidePublicLabel ? "" : node.label, value => change(n => {
        if (!("type" in n)) return;
        n.label = value.trim() ? value : (n.type === "SIZE" ? "أحجام " : "خيارات ") + n.id.slice(-6);
        n.hidePublicLabel = !value.trim();
        if (n.hidePublicLabel) n.highlightInPriceSummary = false;
      }), { disabled: original, placeholder: "يمكن ترك الاسم فارغًا" })}
      {node.type === "OPTIONS" && <div className="config-field-grid">
        {quantity("الحد الأدنى", node.min, "min")}
        {quantity("الحد الأقصى", node.max, "max", true)}
        <label className="full"><span className="config-label-with-info">الكمية المشمولة مجانًا <IncludedQuantityTip /></span>
          <input type="number" aria-label="الكمية المشمولة مجانًا" value={node.includedQuantity} disabled={original}
            onChange={e=>change(n=>Object.assign(n,{includedQuantity:Number(e.target.value)}))} />
        </label>
      </div>}
      {!original && <label className="config-toggle"><input type="checkbox" checked={!!node.highlightInPriceSummary} disabled={node.hidePublicLabel}
        onChange={e => change(n => Object.assign(n, { highlightInPriceSummary: e.target.checked }))} /><Star size={14} /> إبراز في ملخص السعر</label>}
      {node.hidePublicLabel && <small className="config-source-reference">العنوان التقني مخفي عن الزبون ولا يحمل نجمة. الخيارات تحتفظ بنجومها.</small>}
    </>;
    else if (loc.kind === "size") fields = <>
      {label("اسم الحجم", node.label, value => change(n => { n.label = value; }), { disabled: original, placeholder: "مثال: وسط" })}
      {label("السعر", node.price, value => setPrice({ price: value }), { placeholder: "مطلوب — 0 مسموح" })}
    </>;
    else {
      const option = node as Option, linked = option.linkedProduct;
      fields = <>
        {!original && <label>نوع الخيار<select aria-label="نوع الخيار" value={linked ? "linked" : "manual"} onChange={e => {
          if (e.target.value === "manual") change(n => { if ("maxQuantity" in n) delete n.linkedProduct; });
          else change(n => { if ("maxQuantity" in n) n.linkedProduct = { mode: "ORIGINAL", sourceProductId: "", originalPriceOverrides: {} }; });
        }}><option value="manual">خيار يدوي</option><option value="linked">منتج مرتبط</option></select></label>}
        {!original && linked ? <>
          <label>المنتج المرتبط<select aria-label="المنتج المرتبط" value={linked.sourceProductId} onChange={e => {
            const source = candidates.find(p => p.id === e.target.value);
            void onLink(selected!, e.target.value, source?.configurationMode === "LEGACY" ? "CUSTOM" : linked.mode);
          }}>
            <option value="">اختر منتجًا…</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.name}{p.configurationMode === "LEGACY" ? " — عادي (CUSTOM)" : ""}</option>)}
          </select></label>

        </> : label("اسم الخيار", option.label, value => change(n => { n.label = value; }), { disabled: original, placeholder: "مثال: جبنة إضافية" })}
        <div className="config-field-grid">
          {quantity("الحد الأدنى للخيار", option.minQuantity ?? 0, "minQuantity")}
          {quantity("الحد الأقصى للخيار", option.maxQuantity, "maxQuantity", true)}
        </div>
        <PriceFields node={option} scopes={loc.scopes} onChange={setPrice} />
        {!original && linked && <>
          <label>طريقة استخدام خيارات المنتج<select aria-label="طريقة استخدام خيارات المنتج" value={linked.mode}
            onChange={e => {
              const mode = e.target.value as "ORIGINAL" | "CUSTOM";
              if (linked.sourceProductId) void onLink(selected!, linked.sourceProductId, mode);
              else change(n => { if ("maxQuantity" in n) n.linkedProduct = { mode, sourceProductId: "", ...(mode === "ORIGINAL" ? { originalPriceOverrides: {} } : {}) }; });
            }}>
            <option value="ORIGINAL">استخدام خيارات المنتج الأصلية</option><option value="CUSTOM">إعدادات مخصصة داخل العرض</option>
          </select></label>
          <p className="config-help-box">{linked.mode === "ORIGINAL" ? "بنية المصدر للقراءة فقط. تعدّل الأسعار المحلية هنا؛ لا يضاف سعر البيع المنفرد."
            : "هذه نسخة محلية مستقلة. التعديل لا يغيّر المنتج المصدر."}</p>
          <small className="config-source-reference">تغيير المصدر أو طريقة الاستخدام ينشئ تعريف الربط المحلي من جديد؛ لا تحفظه في قاعدة البيانات إلا بزر حفظ المنتج.</small>
        </>}
        {!original && <label className="config-toggle"><input type="checkbox" checked={!!option.highlightInPriceSummary}
          onChange={e => change(n => Object.assign(n, { highlightInPriceSummary: e.target.checked }))} /><Star size={14} /> إبراز الخيار في ملخص السعر</label>}
      </>;
    }
  }
  return <>
    <aside ref={element} className={"config-drawer " + (selected ? "open" : "")} role="complementary"
      aria-labelledby={selected ? "v62-inspector-heading" : undefined} aria-label="خصائص العقدة" onKeyDown={e => {
        if (e.key === "Escape" && selected) { e.preventDefault(); e.stopPropagation(); onClose(); }
      }}>
      {selected && <div className="config-drawer-head"><h4 id="v62-inspector-heading">{title}</h4><button type="button" className="config-icon" aria-label="إغلاق لوحة الخصائص" onClick={onClose}><X size={16} /></button></div>}
      {original && <p className="config-help-box">ORIGINAL — البنية من المصدر، والأسعار تعديلات محلية فقط.</p>}
      {nestedOriginal && <p className="config-help-box">منتج مرتبط داخل المصدر: للقراءة فقط. تجاوز السعر المحلي يخص عقد المصدر المباشرة ولا يعبر إلى منتج مستقل.</p>}
      <fieldset disabled={readOnly || nestedOriginal} style={{ border: 0, padding: 0, margin: 0 }}><div className="config-drawer-body" style={!selected ? { padding: 0 } : undefined}>{fields}</div></fieldset>
    </aside>
  </>;
}
