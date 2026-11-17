"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import { displayCurrencyAmount } from "@/lib/currency-display";
import type { ConfigurationGroupV2 as Group, ProductConfigurationV2 as Config, OptionChoiceV2 as Option } from "@menu/shared";
import { locate, keyOf, shouldFrame, originalTree, originalView, walk, type Ref, type Location, type Destination, type SourceMap } from "./v62-model";

export type TreeActions = {
  onSelect: (ref: Ref | null) => void; onAdd: (destination: Destination, type: Group["type"]) => void;
  onChoice: (ref: Ref) => void; onDelete: (ref: Ref) => void; onStar: (ref: Ref) => void;
  onMove: (ref: Ref, destination: Destination) => void;
};
export function ConfigurationTree({ configuration, sources, selected, readOnly, actions, restaurantId, currency, onError }: {
  configuration: Config; sources: SourceMap; selected: Ref | null; readOnly: boolean; actions: TreeActions;
  restaurantId: string; currency: string; onError: (message: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const endDrag = useRef<(() => void) | null>(null);
  const [branch, setBranch] = useState<Destination | null>(null);
  const branchDialog = useRef<HTMLDialogElement>(null), branchOpener = useRef<HTMLElement | null>(null);
  useEffect(() => { if(branch)branchDialog.current?.showModal();else if(branchDialog.current?.open)branchDialog.current.close(); },[branch]);
  useEffect(() => () => endDrag.current?.(), [configuration]);
  const locations = useMemo(() => {
    const index = new Map<string, Location>();
    walk(configuration, loc => index.set(keyOf({ id: loc.node.id, path: loc.path }), loc));
    return index;
  }, [configuration]);
  const treeRoot = useRef<HTMLElement>(null);
  const structure: string[] = [];
  walk(configuration, loc => structure.push(loc.node.id));
  const structureKey = structure.join("|");
  useEffect(() => {
    const rows = treeRoot.current?.querySelectorAll<HTMLElement>(".config-node-head,.config-option-row");
    const measure = (row: HTMLElement) => {
      const wrapper = row.closest<HTMLElement>("[data-v62-item]");
      if (wrapper) wrapper.style.setProperty("--node-anchor", (row.getBoundingClientRect().top - wrapper.getBoundingClientRect().top + row.offsetHeight / 2) + "px");
    };
    const observer = new ResizeObserver(entries => entries.forEach(entry => {
      const target = entry.target as HTMLElement;
      const row = target.matches(".config-node-head,.config-option-row") ? target : target.querySelector<HTMLElement>(".config-node-head,.config-option-row");
      if (row) measure(row);
    }));
    rows?.forEach(row => { measure(row); observer.observe(row); const wrapper = row.closest("[data-v62-item]"); if (wrapper) observer.observe(wrapper); });
    return () => observer.disconnect();
  }, [structureKey, collapsed, sources]);
  const toggle = (ref: Ref) => setCollapsed(current => { const next = new Set(current), key = keyOf(ref); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const money = (price: string) => {
    if (!price) return "سعر مطلوب";
    try { const value = displayCurrencyAmount(price, currency); return value.endsWith(" " + currency) ? value.slice(0, -currency.length - 1) : value; } catch { return "سعر غير مكتمل"; }
  };
  const addBranch = (target: Destination, label: string, allowSize: boolean, disabled: boolean) =>
    <button type="button" className="config-mini-btn" disabled={disabled} onClick={e=>{
      if(!allowSize){actions.onAdd(target,"OPTIONS");return;}
      branchOpener.current=e.currentTarget;setBranch(target);
    }}>{allowSize?label:"+ خيارات"}</button>;
  const handle = (ref: Ref) => <button type="button" className="config-drag" disabled={readOnly || !!ref.original}
    aria-label={"سحب " + (locations.get(keyOf(ref))?.node.label || "العقدة")}
    title="اسحب للترتيب؛ Alt مع الأسهم للترتيب بلوحة المفاتيح"
    onKeyDown={e => {
      if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault(); const loc = locate(configuration, ref);
        if (loc) actions.onMove(ref, { path: ref.path, container: loc.container, index: loc.index + (e.key === "ArrowUp" ? -1 : 2) });
      }
    }} onPointerDown={e => {
      if(e.button!==0 || readOnly || ref.original)return;
      e.preventDefault();e.stopPropagation();endDrag.current?.();
      const grip=e.currentTarget,source=grip.closest<HTMLElement>("[data-v62-item]")!,list=source.parentElement!;
      const location=locate(configuration,ref);if(!location)return;
      const originalChildren=Array.from(list.children),rect=source.getBoundingClientRect();
      const offsetY=Math.min(Math.max(e.clientY-rect.top,4),Math.max(4,rect.height-4)),pointerId=e.pointerId;
      let lastY=e.clientY;
      const animations=new Set<Animation>();
      source.classList.add("config-sort-source");treeRoot.current?.classList.add("config-sort-active");
      const siblings=()=>Array.from(list.children).filter((x):x is HTMLElement=>x instanceof HTMLElement && x.hasAttribute("data-v62-item") && x!==source);
      const finish=(commit:boolean)=>{
        const ordered=Array.from(list.children).filter(x=>x.hasAttribute("data-v62-item"));
        const targetIndex=ordered.indexOf(source);
        document.removeEventListener("pointermove",motion,true);document.removeEventListener("pointerup",up,true);
        document.removeEventListener("pointercancel",cancel,true);document.removeEventListener("keydown",escape,true);
        animations.forEach(x=>x.cancel());source.style.removeProperty("--config-sort-y");source.classList.remove("config-sort-source");
        treeRoot.current?.classList.remove("config-sort-active");
        // Return DOM ownership to React before applying the real immutable draft update.
        originalChildren.forEach(x=>list.appendChild(x));endDrag.current=null;
        if(commit && targetIndex!==location.index){
          try{actions.onMove(ref,{path:ref.path,container:location.container,index:targetIndex+(targetIndex>location.index?1:0)});}
          catch(error){onError((error as Error).message);}
        }
        grip.focus({preventScroll:true});
      };
      const motion=(event:globalThis.PointerEvent)=>{
        if(event.pointerId!==pointerId)return;event.preventDefault();
        const bounds=list.getBoundingClientRect(),sr=source.getBoundingClientRect();
        const desiredTop=Math.min(Math.max(event.clientY-offsetY,bounds.top),Math.max(bounds.top,bounds.bottom-sr.height));
        const center=desiredTop+sr.height/2,direction=event.clientY-lastY;lastY=event.clientY;
        const items=siblings();let before:HTMLElement|undefined;
        for(const item of items){const r=item.getBoundingClientRect(),c=r.top+r.height/2;
          if(center<c || direction<0 && Math.abs(center-c)<.75){before=item;break;}}
        if(before?source.nextElementSibling!==before:!!source.nextElementSibling){
          const visualTop=source.getBoundingClientRect().top,currentY=parseFloat(source.style.getPropertyValue("--config-sort-y"))||0;
          const oldTops=new Map(items.map(x=>[x,x.getBoundingClientRect().top]));
          list.insertBefore(source,before??null);
          source.style.setProperty("--config-sort-y",(visualTop-(source.getBoundingClientRect().top-currentY))+"px");
          for(const item of items){const delta=oldTops.get(item)!-item.getBoundingClientRect().top;
            if(Math.abs(delta)>=1){const a=item.animate([{transform:`translateY(${delta}px)`},{transform:"translateY(0)"}],{duration:150,easing:"cubic-bezier(.2,.75,.2,1)"});animations.add(a);a.onfinish=()=>animations.delete(a);}}
        }
        const currentY=parseFloat(source.style.getPropertyValue("--config-sort-y"))||0;
        source.style.setProperty("--config-sort-y",(desiredTop-(source.getBoundingClientRect().top-currentY))+"px");
      };
      const up=(event:globalThis.PointerEvent)=>{if(event.pointerId===pointerId){event.preventDefault();finish(true);}};
      const cancel=(event:globalThis.PointerEvent)=>{if(event.pointerId===pointerId)finish(false);};
      const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();finish(false);}};
      document.addEventListener("pointermove",motion,true);document.addEventListener("pointerup",up,true);
      document.addEventListener("pointercancel",cancel,true);document.addEventListener("keydown",escape,true);
      endDrag.current=()=>finish(false);
    }}>☰</button>;
  const star = (ref: Ref, node: { label: string; highlightInPriceSummary?: boolean; hidePublicLabel?: boolean }) =>
    <button type="button" className={"config-icon config-star " + (node.highlightInPriceSummary ? "active" : "")}
      disabled={readOnly || !!ref.original || node.hidePublicLabel} aria-label={"نجمة " + (node.hidePublicLabel ? "المجموعة المخفية" : node.label || "الخيار")}
      aria-pressed={!!node.highlightInPriceSummary} onClick={() => actions.onStar(ref)}><Star size={14} fill={node.highlightInPriceSummary ? "currentColor" : "none"} /></button>;
  function groups(list: Group[], path: string[], container: string, depth: number, ancestorFrame = false, original?: Ref["original"]) {
    return <div className={"config-node-list " + (depth ? "nested" : "")}>
      {list.map((group, index) => {
        const ref: Ref = { id: group.id, path, ...(original ? { original } : {}) }, key = keyOf(ref);
        const choices = group.type === "SIZE" ? group.sizes : group.options;
        const closed = collapsed.has(key), framed = shouldFrame(group, ancestorFrame), insideFrame = ancestorFrame || framed;
        return <div className="config-branch-item" data-v62-item data-last={index === list.length - 1} key={key}>
          <div className={framed ? "config-highlight-frame" : ""}>
          <article data-v62-node={key} className={"config-node-card kind-" + (group.type === "SIZE" ? "size" : "group") +
            (selected && keyOf(selected) === key ? " config-selected" : "")}>
            <div className="config-node-head">
              {!original && handle(ref)}
              <button className="config-collapse" type="button" aria-label={"طي أو فتح " + (group.hidePublicLabel ? (group.type === "SIZE" ? "أحجام" : "خيارات") : group.label)}
                aria-expanded={!closed} onClick={() => toggle(ref)}>{closed ? <ChevronDown size={14} style={{transform:"rotate(90deg)"}} /> : <ChevronDown size={14} />}</button>
              <span className={"config-kind " + (group.type === "SIZE" ? "size" : "group")}>{group.type === "SIZE" ? "أحجام" : "خيارات"}</span>
              <button type="button" className="config-node-title" onClick={() => actions.onSelect(ref)}>
                <b>{group.hidePublicLabel ? (group.type === "SIZE" ? "أحجام" : "خيارات") : group.label}</b>
                <small>{group.type === "SIZE" ? choices.length + " حجم · اختيار واحد" : "Min " + group.min + " · Max " + (group.max ?? "∞") + (group.includedQuantity > 0 ? " · Included " + group.includedQuantity : "")}</small>
              </button>
              <div className="config-node-tools">
                {star(ref, group)}
                {!original && <>
                  <button type="button" className="config-mini-btn" disabled={readOnly} onClick={() => actions.onChoice(ref)}>{group.type === "SIZE" ? "+ حجم" : "+ خيار"}</button>
                  {group.type === "SIZE" ? <button type="button" className="config-mini-btn" aria-label="إضافة خيارات مشتركة للأحجام" disabled={readOnly || depth >= 2}
                    onClick={() => actions.onAdd({ path, container: "children:" + group.id, index: group.children?.length ?? 0 }, "OPTIONS")}>+ خيارات</button>
                    : addBranch({ path, container: "children:" + group.id, index: group.children?.length ?? 0 }, "+ فرع مشترك", !locations.get(keyOf(ref))?.underSize, readOnly || depth >= 2)}
                  <button type="button" className="config-mini-btn danger" disabled={readOnly} onClick={() => actions.onDelete(ref)}>حذف</button>
                </>}
              </div>
            </div>
            {!closed && (choices.length > 0 || (group.children?.length ?? 0) > 0) && <div className="config-node-body">
              <div className="config-options-list">{choices.map((choice, index) => {
                const choiceRef: Ref = { id: choice.id, path, ...(original ? { original } : {}) }, ck = keyOf(choiceRef);
                const option = group.type === "OPTIONS" ? choice as Option : null;
                const cc = collapsed.has(ck), optionFrame = !!option && shouldFrame(option, insideFrame);
                const linked = option?.linkedProduct;
                const nestedOriginal = original ? { ...original, linkedPath: [...(original.linkedPath ?? []), choice.id] } : undefined;
                const source = linked?.mode === "ORIGINAL" ? original
                  ? originalView(configuration, { ...choiceRef, original: nestedOriginal }, sources, restaurantId, currency)
                  : originalTree(configuration, choiceRef, sources, restaurantId, currency) : null;
                return <div className="config-option-wrap" data-v62-item data-last={index === choices.length - 1} key={ck}>
                  <div className={optionFrame ? "config-highlight-frame" : ""}>
                    <div data-v62-node={ck} className={"config-option-row" + (selected && keyOf(selected) === ck ? " config-selected" : "")}>
                      {!original && handle(choiceRef)}
                      {option && (option.children?.length || linked) ? <button type="button" className="config-collapse" aria-label={"طي فروع " + (choice.label || "الخيار")}
                        aria-expanded={!cc} onClick={() => toggle(choiceRef)}>{cc ? <ChevronDown size={14} style={{transform:"rotate(90deg)"}} /> : <ChevronDown size={14} />}</button> : <span className="config-collapse placeholder" />}
                      <button type="button" className="config-option-main" onClick={() => actions.onSelect(choiceRef)}>
                        <b>{choice.label || (group.type === "SIZE" ? "حجم جديد" : "خيار جديد")}</b>
                        <small>{option ? `Min ${option.minQuantity ?? 0} · Max ${option.maxQuantity ?? "∞"} · +${money(choice.price)}` : money(choice.price)}{option?.priceBySize ? " · حسب الحجم" : ""}{linked ? " · منتج مرتبط" : ""}</small>
                      </button>
                      {option && star(choiceRef, option)}
                      {!original && <>
                        {option && addBranch({ path, container: "children:" + choice.id, index: option.children?.length ?? 0 }, "+ فرع",
                          !locations.get(keyOf(choiceRef))?.underSize, readOnly || depth >= 2)}
                        <button type="button" className="config-mini-btn danger" disabled={readOnly} onClick={() => actions.onDelete(choiceRef)}>حذف</button>
                      </>}
                    </div>
                    {option && !cc && <div className="config-option-children">
                      {option.children?.length ? groups(option.children, path, "children:" + choice.id, depth + 1, insideFrame || optionFrame, original) : null}
                      {linked?.mode === "CUSTOM" && linked.customConfiguration ? <>
                        <div className="config-builder-actions"><small>CUSTOM — نسخة محلية</small>
                          {!original && addBranch({ path: [...path, choice.id], container: "root", index: linked.customConfiguration!.groups.length },
                            "+ مجموعة محلية", !locations.get(keyOf(choiceRef))?.underSize, readOnly || depth >= 2)}
                        </div>
                        {groups(linked.customConfiguration.groups, original ? path : [...path, choice.id], "root", depth + 1, insideFrame || optionFrame, nestedOriginal)}
                      </> : null}
                      {source ? groups(source.groups, path, "root", depth + 1, insideFrame || optionFrame, nestedOriginal ?? { owner: choice.id, source: source.productId }) : null}
                      {linked?.mode === "ORIGINAL" && !source && <p className="config-source-reference">بنية المصدر المرتبط للقراءة فقط؛ تُحمّل من الخادم بعد اختيار المصدر.</p>}
                    </div>}
                  </div>
                </div>;
              })}
              </div>
              {group.children?.length ? <div className="config-common-children">{groups(group.children, path, "children:" + group.id, depth + 1, insideFrame, original)}</div> : null}
            </div>}
          </article></div>
        </div>;
      })}
    </div>;
  }
  return <section ref={treeRoot} className="config-tree-panel" aria-label="شجرة تكوين الصنف" onClick={e=>{if(!(e.target as HTMLElement).closest("button,[data-v62-node]")) actions.onSelect(null);}}>
    {configuration.groups.length ? groups(configuration.groups, [], "root", 0) : <p className="config-empty">لا توجد خطوات بعد.</p>}
    <dialog ref={branchDialog} className="config-modal" dir="rtl" aria-label="إضافة فرع" onCancel={e=>{e.preventDefault();e.stopPropagation();setBranch(null);branchOpener.current?.focus();}}>
      <div className="config-modal-head"><h3>إضافة فرع</h3><button type="button" className="config-icon" aria-label="إغلاق إضافة فرع" onClick={()=>{setBranch(null);branchOpener.current?.focus();}}>×</button></div>
      <div className="config-modal-body config-branch-choices">{(["OPTIONS","SIZE"] as const).map(type=><button type="button" className="config-mini-btn" key={type} onClick={()=>{const target=branch;setBranch(null);if(target)actions.onAdd(target,type);}}>{type==="SIZE"?"+ أحجام":"+ خيارات"}</button>)}</div>
    </dialog>
  </section>;
}
