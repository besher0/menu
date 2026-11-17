"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {FileSpreadsheet,Upload,Plus} from "lucide-react";
import {type ProductEditorAggregate,type ProductEditorFields,roleHasPermission} from "@menu/shared";
import {API_URL,apiFetch} from "@/lib/client-api";
import {authHeaders,canReorderCatalog,getBrowserSession,resolveStoredRestaurant} from "@/lib/session";
import {displayCurrencyAmount} from "@/lib/currency-display";
import {saveProductEditor} from "./product-editor-save";
import {safeProductSaveMessage} from "./product-configuration/configuration-editor-errors";
import {productMoodOptions} from "./product-editor-fields-model";
import { productTableSave, moveProductBeforeOrAfter, productRowBefore } from "./product-table-model";
import styles from "./product-management.module.css";

type Product={id:string;editVersion:number;name:string;basePrice:number|null;currency:string;configurationMode?:string;basePriceEditable?:boolean;configurationPrice?:{minimumPrice:string|null;priceDisplay:"EXACT"|"STARTING_AT"|"UNAVAILABLE"};sortOrder:number;isNew:boolean;isPopular:boolean;moodKeys:string[];views?:number;category?:{id:string;name:string}|null;images?:{url:string}[]};
type Page={data:Product[];meta:{page:number;pages:number;limit:number;total:number}};
type Category={id:string;name:string;slug:string};
export function appendProductPage(current:Product[],incoming:Product[]){const ids=new Set(current.map(x=>x.id));return [...current,...incoming.filter(x=>{if(ids.has(x.id))return false;ids.add(x.id);return true})]}

export function ProductManagement({renderImport}:{renderImport:(props:{onClose:()=>void;onImported:(count:number)=>void})=>ReactNode}){
 const [products,setProducts]=useState<Product[]>([]),[meta,setMeta]=useState<Page['meta']>({page:0,pages:1,limit:10,total:0});
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[notice,setNotice]=useState('');
 const [categories,setCategories]=useState<Category[]>([]),[moods,setMoods]=useState<{key:string;label:string}[]>([]),[collapsed,setCollapsed]=useState(new Set<string>());
 const [importOpen,setImportOpen]=useState(false),[busy,setBusy]=useState(new Set<string>()),[exporting,setExporting]=useState(false),[ordering,setOrdering]=useState(false),[dragRevision,setDragRevision]=useState(0),[refresh,setRefresh]=useState(0);
 const [moodProduct,setMoodProduct]=useState<string|null>(null),[moodDraft,setMoodDraft]=useState<string[]>([]),[moodPosition,setMoodPosition]=useState({left:0,top:0});
 const orderBusy=useRef(false),dragActive=useRef(false);const sentinel=useRef<HTMLDivElement>(null),controller=useRef<AbortController|null>(null),generation=useRef(0),requestBusy=useRef(false),mutating=useRef(new Set<string>()),dragCleanup=useRef<()=>void>(()=>{});
 const snapshot=useRef({products,meta,query,loading,error});snapshot.current={products,meta,query,loading,error};
 const session=getBrowserSession(),restaurant=resolveStoredRestaurant(session),admin=session?.user.role==='SUPER_ADMIN';
 const role=session?.memberships.find(x=>x.restaurant.id===restaurant?.id)?.role;
 const canEdit=admin||!!role&&roleHasPermission(role as Parameters<typeof roleHasPermission>[0],'product.update');
 const canOrder=canReorderCatalog()&&!search&&!query&&!loading&&!busy.size&&!ordering;
 const groups=useMemo(()=>{const map=new Map<string,{id:string;name:string;products:Product[]}>();for(const p of products){const id=p.category?.id??'uncategorized';if(!map.has(id))map.set(id,{id,name:p.category?.name??'بدون قسم',products:[]});map.get(id)!.products.push(p)}return [...map.values()]},[products]);
 const load=useCallback(async(page:number,replace=false)=>{
  if(requestBusy.current||dragActive.current||orderBusy.current)return;requestBusy.current=true;const epoch=generation.current;const abort=new AbortController();controller.current=abort;setLoading(true);setError('');
  try{const params=new URLSearchParams({page:String(page),limit:'10',sort:'sortOrder',...(query?{search:query}:{})});const result=await apiFetch<Page>('/dashboard/products?'+params,{signal:abort.signal});
   if(epoch!==generation.current||abort.signal.aborted)return;
   setProducts(old=>replace?appendProductPage([],result.data):appendProductPage(old,result.data));setMeta(result.meta);
  }catch(e){if(epoch===generation.current&&!abort.signal.aborted)setError('تعذر تحميل الأصناف. تحقق من الاتصال وأعد المحاولة.');}
  finally{if(epoch===generation.current){requestBusy.current=false;setLoading(false)}}
 },[query,restaurant?.id]);
 useEffect(()=>{if(search===query)return;dragCleanup.current();generation.current++;controller.current?.abort();requestBusy.current=false;setError('');setLoading(true);const t=setTimeout(()=>{if(search.trim()===query)setRefresh(n=>n+1);else setQuery(search.trim())},250);return()=>clearTimeout(t)},[search]);
 useEffect(()=>{dragCleanup.current();generation.current++;controller.current?.abort();requestBusy.current=false;setProducts([]);setMeta({page:0,pages:1,total:0,limit:10});void load(1,true);return()=>{generation.current++;controller.current?.abort();requestBusy.current=false}},[load,refresh]);
 useEffect(()=>{if(!sentinel.current||loading||error||search.trim()!==query||meta.page>=meta.pages)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!requestBusy.current&&!dragActive.current&&!ordering)void load(snapshot.current.meta.page+1)},{rootMargin:'240px'});observer.observe(sentinel.current);return()=>observer.disconnect()},[load,loading,error,meta,query,search,ordering,dragRevision]);
 useEffect(()=>{let cancelled=false;void apiFetch<Category[]>('/dashboard/categories?sort=sortOrder').then(value=>{if(!cancelled)setCategories((Array.isArray(value)?value:(value as unknown as {data:Category[]}).data??[]).filter(x=>x.slug!=='all'))}).catch(()=>{});
  void apiFetch<{pages:Parameters<typeof productMoodOptions>[0]}>('/dashboard/builder').then(value=>{if(!cancelled)setMoods(productMoodOptions(value.pages??[]))}).catch(()=>{});
  return()=>{cancelled=true}},[restaurant?.id]);
 useEffect(()=>{const changed=()=>setRefresh(n=>n+1);window.addEventListener('ordersawa:product-saved',changed);return()=>{window.removeEventListener('ordersawa:product-saved',changed)}},[]);
 useEffect(()=>()=>dragCleanup.current(),[]);
 useEffect(()=>{if(!moodProduct)return;const close=()=>setMoodProduct(null);const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')close()};const outside=(e:Event)=>{if(!(e.target instanceof Element)||!e.target.closest('.quick-mood-popover,.quick-mood-trigger'))close()};const scrolled=(e:Event)=>{if(!(e.target instanceof Element)||!e.target.closest('.quick-mood-popover'))close()};window.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside);window.addEventListener('scroll',scrolled,true);return()=>{window.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside);window.removeEventListener('scroll',scrolled,true)}},[moodProduct]);

 async function quickSave(p:Product,patch:Partial<ProductEditorFields>){if(!canEdit||orderBusy.current||mutating.current.has(p.id))return;mutating.current.add(p.id);setBusy(new Set(mutating.current));setActionError('');
  setProducts(old=>old.map(x=>x.id===p.id?{...x,...(patch.name===undefined?{}:{name:patch.name}),
   ...(patch.basePrice===undefined?{}:{basePrice:patch.basePrice===null?null:Number.isFinite(Number(patch.basePrice))?Number(patch.basePrice):x.basePrice}),
   ...(patch.isNew===undefined?{}:{isNew:patch.isNew}),...(patch.isPopular===undefined?{}:{isPopular:patch.isPopular}),
   ...(patch.moodKeys===undefined?{}:{moodKeys:patch.moodKeys}),category:p.category}:x));
  try{const current=await apiFetch<ProductEditorAggregate>(`/dashboard/products/${encodeURIComponent(p.id)}/editor`);
   if(current.editVersion!==p.editVersion)throw {status:409};
   const saved=await saveProductEditor((url,init)=>fetch(API_URL+url,{...init,headers:{...authHeaders(),...init?.headers}}),p.id,productTableSave(current,patch,p.basePriceEditable??p.configurationMode!=='NETWORK'),false);
   if(patch.categoryId!==undefined&&patch.categoryId!==current.product.categoryId){setRefresh(n=>n+1);return;}
   const category=categories.find(x=>x.id===saved.product.categoryId);
   setProducts(old=>old.map(x=>x.id===p.id?{...x,name:saved.product.name,basePrice:saved.product.basePrice===null?null:Number(saved.product.basePrice),isNew:saved.product.isNew,isPopular:saved.product.isPopular,moodKeys:saved.product.moodKeys,editVersion:saved.editVersion,category:category??x.category}:x));
  }catch(e){setProducts(old=>old.map(x=>x.id===p.id?p:x));setActionError(safeProductSaveMessage(e));}finally{mutating.current.delete(p.id);setBusy(new Set(mutating.current));}}
 async function exportProducts(){if(exporting)return;setExporting(true);try{const response=await fetch(`${API_URL}/dashboard/products/export`,{headers:authHeaders(),cache:'no-store'});if(!response.ok){setActionError('تعذر تصدير ملف Excel.');return}const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='products-export.xlsx';a.click();URL.revokeObjectURL(url)}catch{setActionError('تعذر تصدير ملف Excel.');}finally{setExporting(false)}}
 async function remove(p:Product){if(!window.confirm('تأكيد حذف المنتج'))return;try{await apiFetch(`/dashboard/products/${p.id}`,{method:'DELETE'});setRefresh(n=>n+1)}catch{setActionError('تعذر حذف الصنف. قد يكون مستخدمًا في صنف مرتبط.')}}
 async function saveOrder(product:Product,target:Product,after:boolean){
  if(orderBusy.current)return;orderBusy.current=true;setOrdering(true);setActionError('');const tenant=restaurant?.id,category=product.category?.id??null;
  try{
   let all:Product[]=[],expectedTotal:number|undefined;
   for(let page=1;;page++){
    if(resolveStoredRestaurant()?.id!==tenant)throw new Error('Restaurant changed');
    const params=new URLSearchParams({sort:'sortOrder',page:String(page),limit:'100',...(category?{categoryId:category}:{})});
    const result=await apiFetch<Page>('/dashboard/products?'+params);
    if(result.meta.page!==page||expectedTotal!==undefined&&result.meta.total!==expectedTotal)throw new Error('Catalog changed');
    expectedTotal=result.meta.total;const merged=appendProductPage(all,result.data);
    if(merged.length!==all.length+result.data.length)throw new Error('Duplicate category page');
    all=merged;if(page>=result.meta.pages)break;
   }
   if(all.length!==expectedTotal||resolveStoredRestaurant()?.id!==tenant)throw new Error('Catalog changed');
   const complete=all.filter(x=>(x.category?.id??null)===category);
   for(const visible of products.filter(x=>(x.category?.id??null)===category)){
    const current=complete.find(x=>x.id===visible.id);
    if(!current||current.sortOrder!==visible.sortOrder||current.editVersion!==visible.editVersion)throw new Error('Stale ordering');
   }
   const moved=moveProductBeforeOrAfter(complete,product.id,target.id,after);
   await apiFetch('/dashboard/products/reorder',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:moved.map((p,index)=>({id:p.id,sortOrder:index}))})});
   const ranks=new Map(moved.map((p,index)=>[p.id,index]));
   setProducts(old=>{const sorted=old.filter(x=>ranks.has(x.id)).map(x=>({...x,sortOrder:ranks.get(x.id)!})).sort((a,b)=>a.sortOrder-b.sortOrder);
    let index=0;return old.map(x=>ranks.has(x.id)?sorted[index++]:x)});
  }catch{setActionError('تعذر حفظ الترتيب. أعد تحميل القائمة ثم حاول مجددًا.');}finally{orderBusy.current=false;setOrdering(false)}
 }
 function startDrag(e:React.PointerEvent<HTMLButtonElement>,product:Product){if(!canOrder||e.button!==0)return;e.preventDefault();const button=e.currentTarget,row=button.closest('tr')!,parent=row.parentElement!,original=Array.from(parent.children),rows=original as HTMLTableRowElement[],initialY=e.clientY,start=row.getBoundingClientRect();let target=original.indexOf(row),lastY=e.clientY;const pointerId=e.pointerId;dragActive.current=true;row.classList.add('product-sort-source');
  const move=(event:PointerEvent)=>{if(event.pointerId!==pointerId)return;event.preventDefault();const direction=event.clientY-lastY;lastY=event.clientY;const top=Math.max(parent.getBoundingClientRect().top,Math.min(parent.getBoundingClientRect().bottom-start.height,start.top+event.clientY-initialY));const previous=new Map(rows.filter(x=>x!==row).map(x=>[x,x.getBoundingClientRect().top]));const center=top+start.height/2;const neighbor=(Array.from(parent.children) as HTMLTableRowElement[]).filter(x=>x!==row).find(x=>productRowBefore(center,x.getBoundingClientRect().top+x.getBoundingClientRect().height/2,direction));if(row.nextElementSibling!==neighbor&&!(neighbor===undefined&&!row.nextElementSibling))parent.insertBefore(row,neighbor??null);row.style.setProperty('--product-sort-y',`${top-row.getBoundingClientRect().top}px`);for(const [sibling,before]of previous){const delta=before-sibling.getBoundingClientRect().top;if(delta)for(const cell of Array.from(sibling.cells))cell.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:150,easing:'cubic-bezier(.2,.75,.2,1)'});}target=Array.from(parent.children).indexOf(row)};
  const finish=(cancel=false)=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelled);window.removeEventListener('keydown',key);original.forEach(x=>parent.appendChild(x));row.classList.remove('product-sort-source');row.style.removeProperty('--product-sort-y');button.focus();dragActive.current=false;setDragRevision(n=>n+1);dragCleanup.current=()=>{};
   const siblings=products.filter(x=>x.category?.id===product.category?.id),from=siblings.findIndex(x=>x.id===product.id);if(!cancel&&target!==from){const destination=siblings[target];if(destination)void saveOrder(product,destination,target>from)}};
  const up=(event:PointerEvent)=>{if(event.pointerId===pointerId)finish()},cancelled=(event?:PointerEvent)=>{if(!event||event.pointerId===pointerId)finish(true)},key=(k:KeyboardEvent)=>{if(k.key==='Escape'){k.preventDefault();finish(true)}};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',cancelled,{once:true});window.addEventListener('keydown',key);dragCleanup.current=cancelled;
 }
 function keyboardMove(p:Product,direction:number){if(!canOrder)return;const same=products.filter(x=>x.category?.id===p.category?.id),i=same.findIndex(x=>x.id===p.id),target=same[i+direction];if(!target)return;void saveOrder(p,target,direction>0)}
 return <section className={styles.management} dir="rtl" aria-label="إدارة الأصناف">
  <header className="section-head"><h3>الأصناف</h3><div className="actions">
   <Link className="btn primary" href="/dashboard/products/new"><Plus size={20}/>إضافة صنف</Link>
   {admin&&<><button type="button" className="btn" onClick={()=>setImportOpen(true)}><FileSpreadsheet size={20}/>استيراد من Excel</button><button type="button" className="btn" onClick={()=>void exportProducts()} disabled={exporting}><Upload size={20}/>تصدير</button></>}
  </div></header>
  <div className="toolbar"><label className="search-wrap"><span className="search-icon" aria-hidden>⌕</span><input className="search" aria-label="ابحث عن صنف" placeholder="ابحث عن صنف..." value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
  {actionError&&<p role="alert">{actionError}</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error} <button type="button" className="btn small" onClick={()=>void load(meta.page?meta.page+1:1,!meta.page)}>إعادة المحاولة</button></p>}
  <div className="product-groups">{groups.map(group=><section className="product-group-card" key={group.id}>
   <header className="product-group-head"><div className="actions"><button type="button" className="expander" aria-label={'طي أو فتح '+group.name} aria-expanded={!collapsed.has(group.id)} onClick={()=>setCollapsed(old=>{const next=new Set(old);next.has(group.id)?next.delete(group.id):next.add(group.id);return next})}>{collapsed.has(group.id)?'‹':'⌄'}</button><b>{group.name}</b><span className="subtle">({group.products.length})</span></div></header>
   {!collapsed.has(group.id)&&<div className="table-wrap product-table"><table><thead><tr><th className="product-name-head">الصنف</th><th>القسم</th><th className="price-head">السعر</th><th>المشاهدات</th>{!!moods.length&&<th>شو مزاجك اليوم</th>}<th>الأكثر طلبًا</th><th>جديدنا</th><th>الإجراء</th></tr></thead>
   <tbody>{group.products.map(p=><tr key={p.id} data-product-row={p.id}>
    <td><div className="product-name-cell"><button type="button" className="product-order-grip" aria-label={'ترتيب '+p.name} disabled={!canOrder} onPointerDown={e=>startDrag(e,p)} onKeyDown={e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();keyboardMove(p,e.key==='ArrowUp'?-1:1)}}}>☰</button>{p.images?.[0]?.url&&<img className="product-image" src={p.images[0].url} alt=""/>}<input className="quick-input" aria-label={'اسم '+p.name} key={p.id+'-name-'+p.name} defaultValue={p.name} disabled={!canEdit||ordering||busy.has(p.id)} onBlur={e=>{if(e.target.value!==p.name)void quickSave(p,{name:e.target.value})}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=p.name;e.currentTarget.blur()}}}/></div></td>
    <td><select className="compact-select" aria-label={'قسم '+p.name} value={p.category?.id??''} disabled={!canEdit||ordering||busy.has(p.id)} onChange={e=>void quickSave(p,{categoryId:e.target.value})}><option value="">بدون قسم</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
    <td className="price-cell">{(p.basePriceEditable??p.configurationMode!=='NETWORK')?<input className="quick-input quick-price" key={p.id+'-price-'+p.basePrice} aria-label={'سعر '+p.name} defaultValue={p.basePrice===null?'':String(p.basePrice)} inputMode="decimal" disabled={!canEdit||ordering||busy.has(p.id)} onBlur={e=>{const value=e.target.value.trim();if(value!==(p.basePrice===null?'':String(p.basePrice)))void quickSave(p,{basePrice:value||null})}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=p.basePrice===null?'':String(p.basePrice);e.currentTarget.blur()}}}/>:<Link className="price-derived" href={`/dashboard/products/${p.id}/edit`} title="السعر مشتق من شبكة التكوين">{p.configurationPrice?.priceDisplay==="STARTING_AT"?"ابتداءً من ":""}{displayCurrencyAmount(p.configurationPrice?.minimumPrice,p.currency,"ar")}</Link>}</td>
    <td><span className="views">{p.views??0}</span></td>
    {!!moods.length&&<td><button type="button" className="quick-mood-trigger" disabled={!canEdit||ordering||busy.has(p.id)} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setMoodPosition({left:Math.max(8,Math.min(innerWidth-278,r.right-270)),top:Math.max(8,Math.min(innerHeight-300,r.bottom+6))});setMoodProduct(p.id);setMoodDraft(p.moodKeys??[])}}><span className="summary">{!p.moodKeys?.length?'بدون اختيار':p.moodKeys.length===1?moods.find(x=>x.key===p.moodKeys[0])?.label??p.moodKeys[0]:`عدة خيارات (${p.moodKeys.length})`}</span><span className="chev">⌄</span></button></td>}
    <td className="check-cell"><input className="feature-check" type="checkbox" aria-label={'الأكثر طلبًا '+p.name} checked={p.isPopular} disabled={!canEdit||ordering||busy.has(p.id)} onChange={e=>void quickSave(p,{isPopular:e.target.checked})}/></td>
    <td className="check-cell"><input className="feature-check" type="checkbox" aria-label={'جديدنا '+p.name} checked={p.isNew} disabled={!canEdit||ordering||busy.has(p.id)} onChange={e=>void quickSave(p,{isNew:e.target.checked})}/></td>
    <td><div className="actions"><Link className="btn small" href={`/dashboard/products/${p.id}/edit`}>تعديل</Link><button type="button" className="btn danger small" disabled={ordering} onClick={()=>void remove(p)}>حذف</button></div></td>
   </tr>)}</tbody></table></div>}
  </section>)}</div>
  {loading&&<p role="status" className="empty">جارٍ تحميل الأصناف…</p>}
  {!loading&&!products.length&&!error&&<div className="empty">لا توجد أصناف مطابقة.</div>}
  <div ref={sentinel} data-product-pagination-sentinel aria-hidden="true" style={{height:1}}/>
  {!loading&&products.length>0&&meta.page>=meta.pages&&<span className="subtle" role="status">نهاية الأصناف</span>}
  {moodProduct&&<div className="quick-mood-popover" role="dialog" aria-label="شو مزاجك اليوم" style={moodPosition}><div className="quick-mood-popover-title">شو مزاجك اليوم</div><div className="quick-mood-options">{moods.map(x=><label className="quick-mood-option" key={x.key}><input type="checkbox" checked={moodDraft.includes(x.key)} onChange={e=>setMoodDraft(old=>e.target.checked?[...old,x.key]:old.filter(k=>k!==x.key))}/>{x.label}</label>)}</div><div className="actions"><button className="btn small" type="button" onClick={()=>{const p=products.find(x=>x.id===moodProduct);if(p)void quickSave(p,{moodKeys:moodDraft});setMoodProduct(null)}}>تطبيق</button><button className="btn small" type="button" onClick={()=>setMoodProduct(null)}>إلغاء</button></div></div>}
  {admin&&importOpen&&renderImport({onClose:()=>setImportOpen(false),onImported:count=>{setImportOpen(false);setNotice(`تم استيراد ${count} منتج بنجاح`);setRefresh(n=>n+1)}})}
 </section>;
}
