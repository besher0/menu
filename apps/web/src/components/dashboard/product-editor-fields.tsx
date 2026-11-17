"use client";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ImagePlus, Star, Utensils, X, Scale, Flame, Wheat, Drumstick, Beef, Heart, Clock3, Sparkles } from "lucide-react";
import { currencyDisplayLabel } from "@menu/shared";
import type { FormState } from "./product-form";
import { availableLibrary, chooseDetail, chooseIngredient, libraryIdentity, MAX_PRODUCT_IMAGES, reorder, type IngredientItem, type DetailItem } from "./product-editor-fields-model";
import styles from "./product-editor-fields.module.css";
import configurationStyles from "./product-configuration/v62-editor.module.css";

const icons = { scale: Scale, flame: Flame, wheat: Wheat, drumstick: Drumstick, beef: Beef, heart: Heart, clock: Clock3, star: Star, sparkles: Sparkles, utensils: Utensils };
function Photo({ url, label, icon }: { url?: string; label: string; icon?: string }) {
  const Icon = icons[icon as keyof typeof icons] ?? Utensils;
  return url ? <img src={url} alt={label} draggable={false} /> : icon ? <Icon size={28} aria-hidden /> : <span className="library-empty-photo" aria-hidden>◈</span>;
}
function Sortable({ scope, index, label, disabled, move, children, className = "" }: {
  scope: string; index: number; count: number; label: string; disabled: boolean; move: (from: number, to: number) => void; children: ReactNode; className?: string;
}) {
  const cleanup = useRef<(() => void) | null>(null), suppressClick = useRef(false);
  useEffect(() => () => cleanup.current?.(), []);
  return <article className={className} data-editor-sort={scope} data-sort-index={index}
    onClickCapture={e => { if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;} }}
    tabIndex={disabled ? undefined : 0} aria-label={label} aria-roledescription="بطاقة قابلة للترتيب"
    onKeyDown={e => {
      if (e.target !== e.currentTarget || disabled) return;
      if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault(); move(index, index + (e.key === "ArrowUp" ? -1 : 1));
      }
    }} onPointerDown={e => {
      const target=e.target as HTMLElement, source=e.currentTarget;
      const gallery=scope==="images";
      if (disabled || e.button!==0 || (!gallery && !target.closest(".library-drag-zone"))
        || target.closest('input,select,textarea,a,button:not(.image-thumb)')) return;
      // Library cards start immediately from the reference's drag zone. Gallery
      // keeps ordinary image selection; moving a thumbnail enables reordering.
      if (!gallery) e.preventDefault();
      cleanup.current?.();
      const list=source.parentElement!, rect=source.getBoundingClientRect();
      const offsetX=e.clientX-rect.left, offsetY=e.clientY-rect.top;
      const pointerId=e.pointerId, startX=e.clientX, startY=e.clientY;
      let placeholder:HTMLElement|null=null, ghost:HTMLElement|null=null;
      const begin=()=>{
        placeholder=document.createElement("div");
        placeholder.className="component-placeholder"+(scope==="details"?" small":"");
        if(gallery)Object.assign(placeholder.style,{width:rect.width+"px",height:rect.height+"px"});
        list.insertBefore(placeholder,source);
        ghost=source.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("data-editor-sort");ghost.removeAttribute("tabindex");
        ghost.setAttribute("aria-hidden","true");ghost.setAttribute("inert","");
        ghost.querySelectorAll("[id]").forEach(x=>x.removeAttribute("id"));
        ghost.classList.add("editor-drag-ghost");
        Object.assign(ghost.style,{width:rect.width+"px",left:rect.left+"px",top:rect.top+"px"});
        // Native dialog top-layer containment, with the same viewport coordinates.
        source.closest("[data-product-fields]")!.appendChild(ghost);
        source.classList.add("is-source");
      };
      const finish=(commit:boolean)=>{
        let to=index;
        if(placeholder){to=0;for(const child of Array.from(list.children)){
          if(child===placeholder)break;
          if(child!==source && (child as HTMLElement).dataset.editorSort===scope)to++;
        }}
        const moved=!!placeholder;
        document.removeEventListener("pointermove",motion,true);
        document.removeEventListener("pointerup",up,true);
        document.removeEventListener("pointercancel",cancel,true);
        document.removeEventListener("keydown",key,true);
        ghost?.remove();placeholder?.remove();source.classList.remove("is-source");cleanup.current=null;
        if(gallery && moved){suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);}
        if(commit && moved)move(index,to);
      };
      const motion=(event:globalThis.PointerEvent)=>{
        if(event.pointerId!==pointerId)return;
        if(!placeholder && Math.hypot(event.clientX-startX,event.clientY-startY)<7)return;
        event.preventDefault();if(!placeholder)begin();
        ghost!.style.left=(event.clientX-offsetX)+"px";ghost!.style.top=(event.clientY-offsetY)+"px";
        const tiles=Array.from(list.children).filter((x):x is HTMLElement=>x instanceof HTMLElement && x!==source && x.dataset.editorSort===scope);
        let nearest:{tile:HTMLElement;r:DOMRect;cx:number;cy:number}|undefined,best=Infinity;
        for(const tile of tiles){const r=tile.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,d=Math.hypot(event.clientX-cx,event.clientY-cy);
          if(d<best){best=d;nearest={tile,r,cx,cy};}}
        if(!nearest){list.appendChild(placeholder!);return;}
        const {tile,r,cx,cy}=nearest;
        const before=gallery || Math.abs(event.clientY-cy)>r.height*.65 ? event.clientY<cy
          : getComputedStyle(list).direction==="rtl" ? event.clientX>cx : event.clientX<cx;
        list.insertBefore(placeholder!,before?tile:tile.nextSibling);
      };
      const up=(event:globalThis.PointerEvent)=>{if(event.pointerId===pointerId){if(placeholder)event.preventDefault();finish(true);}};
      const cancel=(event:globalThis.PointerEvent)=>{if(event.pointerId===pointerId)finish(false);};
      const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();finish(false);source.focus({preventScroll:true});}};
      document.addEventListener("pointermove",motion,true);document.addEventListener("pointerup",up,true);
      document.addEventListener("pointercancel",cancel,true);document.addEventListener("keydown",key,true);
      cleanup.current=()=>finish(false);if(!gallery)begin();
    }}>{children}</article>;
}
function LibraryPickerButton({ disabled, onOpen, children }: { disabled: boolean; onOpen: () => void; children: ReactNode }) {
  const button = useRef<HTMLButtonElement>(null), activate = useRef(onOpen); activate.current = onOpen;
  useEffect(() => {
    const element = button.current!;
    let start: { id: number; x: number; y: number } | null = null;
    const begin = (event: TouchEvent) => {
      const point = event.touches.length === 1 ? event.touches[0] : null;
      start = point ? { id: point.identifier, x: point.clientX, y: point.clientY } : null;
    };
    const cancel = () => { start = null; };
    const end = (event: TouchEvent) => {
      const origin = start; start = null;
      if (!origin || element.disabled) return;
      // A non-passive touchend can suppress the compatibility click before opening the modal.
      // Doing this at pointerup instead can retarget that click into the newly opened picker.
      event.preventDefault();
      const point = Array.from(event.changedTouches).find(x => x.identifier === origin.id);
      if (!point || Math.hypot(point.clientX - origin.x, point.clientY - origin.y) > 10) return;
      element.focus({ preventScroll: true }); activate.current();
    };
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchend", end, { passive: false });
    element.addEventListener("touchcancel", cancel, { passive: true });
    return () => { element.removeEventListener("touchstart", begin); element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", cancel); };
  }, []);
  return <button ref={button} type="button" className="field-button" disabled={disabled} aria-label={typeof children === "string" ? children : undefined} onClick={onOpen}>اختيار من المكتبة</button>;
}
export function ProductEditorFields({ draft, patch, categories, moods, ingredients, details, ingredientStatus, detailStatus, disabled,
  sizesControlBase, baseReadOnly = false, uploading, uploadError, onUpload, onDismissUploadError }: {
  draft: FormState; patch: (patch: Partial<FormState>) => void;
  categories: Array<{ id: string; name: string }>; moods: Array<{ key: string; label: string }>;
  ingredients: IngredientItem[]; details: DetailItem[]; ingredientStatus: string; detailStatus: string;
  disabled: boolean; sizesControlBase: boolean; baseReadOnly?: boolean; uploading: boolean; uploadError: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onDismissUploadError: () => void;
}) {
  const [activeImage, setActiveImage] = useState(0), [picker, setPicker] = useState<"ingredients" | "details" | null>(null);
  const [touchTip, setTouchTip] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null);
  useEffect(() => { if (picker) { dialog.current?.showModal(); } else if (dialog.current?.open) dialog.current.close(); }, [picker]);
  const close = () => { setPicker(null); opener.current?.focus(); };
  const open = (kind: "ingredients" | "details") => { opener.current = document.activeElement as HTMLElement; setPicker(kind); };
  const imageIndex = Math.min(activeImage, Math.max(draft.imageUrls.length - 1, 0)), currentImage = draft.imageUrls[imageIndex];
  const moveImages = (from: number, to: number) => { patch({ imageUrls: reorder(draft.imageUrls, from, to) }); setActiveImage(to); };
  const availableIngredients = availableLibrary(ingredients, draft.ingredients), availableDetails = availableLibrary(details, draft.mealDetails);
  const missingCategory = !!draft.categoryId && !categories.some(x => x.id === draft.categoryId);
  const knownMoods = new Set(moods.map(x => x.key)), allMoods = [...moods, ...draft.moodKeys.filter(x => !knownMoods.has(x)).map(x => ({ key: x, label: x + " (اختيار محفوظ)" }))];
  const choices = (picker === "ingredients" ? availableIngredients.map(x => ({ ...x, text: x.displayName || x.name }))
    : availableDetails.map(x => ({ ...x, text: x.displayName || x.label })));
  return <section className={styles.fields} data-product-fields aria-label="بيانات المنتج V62">
    <div className="field-head"><h2>صور الصنف — أول صورة هي الأساسية</h2></div>
    <div className="field-head"><div className="image-actions"><label className="field-button primary">رفع صورة
      <input type="file" accept="image/*" multiple aria-label="رفع صور المنتج" disabled={disabled || uploading || draft.imageUrls.length >= MAX_PRODUCT_IMAGES} onChange={onUpload} />
    </label><span className="image-count">{draft.imageUrls.length} / {MAX_PRODUCT_IMAGES}</span></div><span className="field-note">حتى 5 صور لكل صنف</span></div>
    {draft.imageUrls.length > MAX_PRODUCT_IMAGES && <p className="field-warning">لهذا المنتج صور محفوظة أكثر من الحد الحالي. بقيت كلها؛ يمكنك ترتيبها أو إزالتها صراحةً، ولا يمكن إضافة صور حتى يقل العدد عن خمس.</p>}
    <div className="image-workspace">
      <div className="image-main"><span className="ratio-badge">16:9</span>{currentImage ? <img src={currentImage} alt={draft.name || "صورة المنتج"} /> : <span className="field-note"><ImagePlus size={32} /> لا توجد صورة</span>}</div>
      <div className="image-thumbs">{draft.imageUrls.map((url, index) => <Sortable key={url} scope="images" index={index} count={draft.imageUrls.length} label={"الصورة " + (index + 1)} disabled={disabled || uploading} move={moveImages}
        className={"image-tile " + (index === imageIndex ? "active" : "")}>
        <button type="button" className="image-thumb" aria-label={"معاينة الصورة " + (index + 1)} aria-pressed={index === imageIndex} onClick={() => setActiveImage(index)}><img src={url} alt="" draggable={false} /></button>
        <div className="image-tools"><button type="button" className={"icon-button " + (index === 0 ? "is-primary" : "")} disabled={disabled || uploading} aria-pressed={index === 0}
          aria-label={index === 0 ? "الصورة الرئيسية" : "تعيين الصورة " + (index + 1) + " رئيسية"} onClick={() => moveImages(index, 0)}>★</button>
          <button type="button" className="icon-button" disabled={disabled || uploading} aria-label={"إزالة الصورة " + (index + 1)} onClick={() => patch({ imageUrls: draft.imageUrls.filter((_, i) => i !== index) })}>×</button></div>
      </Sortable>)}</div>
    </div>
    {uploading && <p role="status" className="field-note">جارٍ رفع الصور… لا يمكن الحفظ حتى اكتمال الرفع.</p>}
    {uploadError && <div className="field-warning" role="alert">تعذر إكمال الرفع. بقيت المسودة والصور التي نجح رفعها. أعد اختيار الصور التي فشلت، أو <button type="button" className="field-button" onClick={onDismissUploadError}>إلغاء محاولة الرفع الفاشلة</button></div>}
    <div className="basic-grid">
      <label className="basic-name">اسم الصنف<input aria-label="اسم المنتج" value={draft.name} required maxLength={200} disabled={disabled} onChange={e => patch({ name: e.target.value })} /></label>
      <label className="basic-category">القسم<select aria-label="القسم" value={draft.categoryId} required disabled={disabled} onChange={e => patch({ categoryId: e.target.value })}>
        <option value="">اختر القسم</option>{missingCategory && <option value={draft.categoryId} disabled>قسم محفوظ غير متاح — اختر قسمًا صالحًا</option>}
        {categories.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {missingCategory && <small className="field-note">لم يتغير القسم المحفوظ. اختر قسمًا متاحًا قبل الحفظ.</small>}
      </label>
      <label className={configurationStyles.basePrice + " basic-price"} tabIndex={sizesControlBase ? 0 : undefined} onClick={() => sizesControlBase && setTouchTip(x => !x)} onBlur={() => setTouchTip(false)}>السعر الأساسي
        <span className={"price-frame " + (sizesControlBase || baseReadOnly ? "disabled" : "")}><input aria-label="السعر الأساسي Base" inputMode="decimal" value={draft.basePrice} required={!draft.configuration}
          disabled={disabled || sizesControlBase || baseReadOnly} maxLength={30} onChange={e => patch({ basePrice: e.target.value })} aria-describedby={sizesControlBase ? "base-price-help" : undefined} />
          <span className="price-currency" aria-label="عملة السعر">{({EUR: "€", USD: "$", AED: "د.إ"} as Record<string,string>)[draft.currency] ?? currencyDisplayLabel(draft.currency,"ar")}</span></span>
        {sizesControlBase && <>
          <span className="base-tip" id="base-price-help" role="tooltip" style={touchTip ? { display: "block", animation: "none" } : undefined}>تُحدد الأسعار من الأحجام. يبقى السعر الأساسي محفوظًا ويمكن تعديله بعد إزالة الأحجام.</span></>}
      </label>

    </div>
    <section style={{ marginTop: 14 }} aria-label="شو مزاجك اليوم"><h3>شو مزاجك اليوم — اختيار من متعدد</h3>
      {allMoods.length ? <div className="mood-box">{allMoods.map(x => <label className="pe-mood-choice" key={x.key}><input type="checkbox" disabled={disabled} checked={draft.moodKeys.includes(x.key)}
        onChange={() => patch({ moodKeys: draft.moodKeys.includes(x.key) ? draft.moodKeys.filter(k => k !== x.key) : [...draft.moodKeys, x.key] })} /><span dir="auto">{x.label}</span></label>)}</div>
        : <p className="field-note">لا توجد خيارات مزاج مفعلة في الواجهة. لا يتغير أي اختيار محفوظ.</p>}
    </section>
    <div className="flags-grid">{([['isNew','إضافة إلى جديدنا','يظهر الصنف ضمن مجموعة جديدنا في الواجهة.'],['isPopular','إضافة إلى الأكثر طلبًا','يظهر الصنف ضمن مجموعة الأكثر طلبًا في الواجهة.']] as const).map(([key, label, help]) =>
      <label className="flag-card" key={key}><input type="checkbox" checked={draft[key]} disabled={disabled} onChange={e => patch({ [key]: e.target.checked })} /><span><b>{label}</b><small>{help}</small></span></label>)}</div>
    <label>وصف الصنف<textarea aria-label="الوصف" rows={4} value={draft.description} maxLength={10000} disabled={disabled} onChange={e => patch({ description: e.target.value })} /></label>
    {(["ingredients", "details"] as const).map(kind => {
      const items = kind === "ingredients" ? draft.ingredients : draft.mealDetails, title = kind === "ingredients" ? "المكونات" : "تفاصيل الوجبة";
      return <section className="library-section" key={kind} aria-label={title}><div className="field-head"><h3>{title}</h3><LibraryPickerButton disabled={disabled} onOpen={() => open(kind)}>{"اختيار " + title + " من المكتبة"}</LibraryPickerButton></div>
        <div className={"media-strip" + (kind === "details" ? " compact" : "")}>{items.map((item, index) => {
          const detail = kind === "details" ? item as DetailItem : null, name = detail ? detail.displayName || detail.label : (item as IngredientItem).displayName || (item as IngredientItem).name;
          return <Sortable key={libraryIdentity(item) ?? "legacy-" + index} scope={kind} index={index} count={items.length} label={name} disabled={disabled}
            className={"library-card " + (detail ? "detail" : "")} move={(from, to) => patch(kind === "ingredients" ? { ingredients: reorder(draft.ingredients, from, to) } : { mealDetails: reorder(draft.mealDetails, from, to) })}>
            <button type="button" className="icon-button remove-card" aria-label={"إزالة " + name + " من الصنف"} disabled={disabled}
              onClick={() => patch(kind === "ingredients" ? { ingredients: draft.ingredients.filter((_, i) => i !== index) } : { mealDetails: draft.mealDetails.filter((_, i) => i !== index) })}>×</button>
            <div className="library-drag-zone" title="اسحب الكارد لإعادة الترتيب"><div className="library-photo"><Photo url={detail ? detail.iconUrl : (item as IngredientItem).imageUrl} icon={detail?.icon} label={name} /></div>
            <span className="library-name">{name}</span></div>
            {detail && (detail.valueType === "PRESENCE" ? <small className="library-presence">صفة وجودية — بدون قيمة</small> : <><label className="library-value-label" htmlFor={"meal-value-"+index}>قيمة التفصيل</label><input id={"meal-value-"+index} className="library-value" aria-label={"قيمة " + name} placeholder={name === "الوزن" ? "مثال: 450 غ" : name === "مستوى الحدة" ? "مثال: متوسط" : name === "الحجم" ? "مثال: 500 مل" : "أدخل القيمة"} required maxLength={500} value={detail.value} disabled={disabled}
              onChange={e => patch({ mealDetails: draft.mealDetails.map((x, i) => i === index ? { ...x, value: e.target.value } : x) })} /></>)}
          </Sortable>;
        })}</div>
        {kind === "details" && <p className="field-note" style={{marginTop:7}}>اختر التفصيل من المكتبة ثم أدخل قيمته الخاصة بهذا الصنف تحت الأيقونة. الصفات الوجودية لا تحتاج إلى قيمة.</p>}
      </section>;
    })}
    <dialog ref={dialog} className="library-dialog" dir="rtl" aria-labelledby="product-library-heading" onCancel={e => { e.preventDefault(); e.stopPropagation(); close(); }}
      >
      <div className="library-head"><h3 id="product-library-heading">اختيار {picker === "ingredients" ? "مكونات" : "تفاصيل وجبة"} من المكتبة</h3><button type="button" className="icon-button" aria-label="إغلاق المكتبة" onClick={close}><X size={16} /></button></div>
      <div className="library-body">
      {(picker === "ingredients" ? ingredientStatus : detailStatus) === "loading" && <p role="status">جارٍ تحميل المكتبة…</p>}
      {(picker === "ingredients" ? ingredientStatus : detailStatus) === "error" && <p role="alert">تعذر تحميل المكتبة. لم تُحذف اختيارات المنتج.</p>}
      <div className="library-grid">{choices.map(item => <button key={libraryIdentity(item)} type="button" className="library-choice" disabled={disabled} onClick={() => {
        if (picker === "ingredients") patch({ ingredients: chooseIngredient(draft.ingredients, item as IngredientItem) });
        else patch({ mealDetails: chooseDetail(draft.mealDetails, item as DetailItem) });
        close();
        if (picker === "details" && (item as DetailItem).valueType !== "PRESENCE") requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-product-fields] .detail:last-child .library-value")?.focus());
      }}><div className="library-photo"><Photo url={"imageUrl" in item ? item.imageUrl : (item as DetailItem).iconUrl} icon={"icon" in item ? item.icon as string : undefined} label={item.text} /></div>
        <span>{item.text}</span>{"valueType" in item && item.valueType === "PRESENCE" && <small>صفة وجودية</small>}</button>)}</div>
      {!choices.length && <p className="field-note">لا توجد عناصر أخرى متاحة للاختيار في هذا القسم.</p>}
      </div><div className="library-foot"><button type="button" className="field-button" onClick={close}>إغلاق</button></div>
    </dialog>
  </section>;
}
