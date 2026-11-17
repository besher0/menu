"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { resolveStoredRestaurant } from "@/lib/session";
type Entry={id:string;stars:number;comment:string|null;customerName:string|null;customerPhone:string|null;createdAt:string};
type Inbox={items:Entry[];total:number;page:number;pages:number};
export function FeedbackClient(){
 const [page,setPage]=useState(1),[inbox,setInbox]=useState<Inbox|null>(null),[error,setError]=useState("");
 const [restaurantId,setRestaurantId]=useState("");
 useEffect(()=>{const update=()=>{const id=resolveStoredRestaurant()?.id??"";setRestaurantId(id);setPage(1);setInbox(null);};update();window.addEventListener("storage",update);window.addEventListener("restaurant:changed",update);return()=>{window.removeEventListener("storage",update);window.removeEventListener("restaurant:changed",update);};},[]);
 useEffect(()=>{if(!restaurantId)return;let current=true;setInbox(null);setError("");apiFetch<Inbox>(`/dashboard/feedback?page=${page}`).then(value=>{if(current)setInbox(value);}).catch(()=>{if(current)setError("تعذر تحميل التقييمات والشكاوي.");});return()=>{current=false;};},[page,restaurantId]);
 return <section className="restaurant-dashboard-page feedback-inbox" dir="rtl"><h1>التقييمات والشكاوي</h1>
  {error?<p role="alert">{error}</p>:!inbox?<p role="status">جارٍ التحميل…</p>:<>
   {!inbox.items.length?<p>لا توجد تقييمات بعد.</p>:inbox.items.map(item=><article key={item.id} className="settings-card feedback-entry">
    <header><strong aria-label={`${item.stars} من 5 نجوم`}>{"★".repeat(item.stars)}{"☆".repeat(5-item.stars)}</strong><span className={`feedback-tone tone-${item.stars>=4?"positive":item.stars===3?"neutral":"negative"}`}>{item.stars>=4?"إيجابي":item.stars===3?"ملاحظة":"سلبي"}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("ar",{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.createdAt))}</time></header>
    {item.comment?<p>{item.comment}</p>:null}
    {item.customerName?<p>الاسم: {item.customerName}</p>:null}
    {item.customerPhone?<p>رقم الهاتف: <bdi>{item.customerPhone}</bdi></p>:null}
   </article>)}
   {inbox.pages>1?<nav aria-label="صفحات التقييمات"><button disabled={page===1} onClick={()=>setPage(n=>n-1)}>السابق</button><span>{page} / {inbox.pages}</span><button disabled={page>=inbox.pages} onClick={()=>setPage(n=>n+1)}>التالي</button></nav>:null}
  </>}
 </section>;
}
