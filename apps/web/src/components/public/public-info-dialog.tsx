"use client";
import { useRef, useState, type FormEvent } from "react";
import { MapPin, Star } from "lucide-react";
import { feedbackMode, feedbackRequiresComment } from "@menu/shared";
import type { PublicMenuData } from "@/lib/api";
import { clientUuid } from "@/lib/client-uuid";
import { SocialIcon } from "./social-icon";
import { feedbackError, feedbackWhatsappUrl, publicAboutInfo } from "./public-feedback-model";

export function PublicInfoContent({kind,restaurant,language,drawerAbout=false}:{drawerAbout?:boolean;kind:"about"|"feedback";restaurant:PublicMenuData["restaurant"];language:"ar"|"en"}) {
 const ar=language==="ar",about=publicAboutInfo(restaurant);
 const [stars,setStars]=useState(0),[comment,setComment]=useState(""),[name,setName]=useState(""),[phone,setPhone]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[received,setReceived]=useState(false);
 const client=useRef<string|null>(null);
 const attempt=useRef<{signature:string;id:string}|null>(null),mode=feedbackMode(restaurant.feedbackMode);
 const prompt=stars>=4?(ar?"سعداء إن تجربتك كانت حلوة! شاركنا رأيك.":"Glad you enjoyed your experience! Share your thoughts.")
  :stars===3?(ar?"شو فينا نحسّن بتجربتك؟":"How could we improve your experience?")
  :stars>0?(ar?"نأسف إن تجربتك ما كانت بالمستوى المطلوب. احكيلنا شو المشكلة اللي واجهتك.":"Sorry your experience fell short. Tell us what happened."):"";
 function validate(){const message=feedbackError(stars,comment,ar);setError(message||"");return !message;}
 async function submit(event:FormEvent) {
  event.preventDefault();if(busy||received||!validate())return;
  if(mode==="WHATSAPP"){
   const href=feedbackWhatsappUrl(restaurant.whatsappPhone,stars,comment,ar);
   if(!href){setError(ar?"التواصل عبر واتساب غير متاح حاليًا.":"WhatsApp is currently unavailable.");return;}
   window.open(href,"_blank","noopener,noreferrer");return;
  }
  if(phone.trim()&&(!/^\+?[\d\s().-]+$/.test(phone.trim())||!/^\d{6,20}$/.test(phone.replace(/\D/g,"")))){
   setError(ar?"تحقق من رقم الهاتف أو اتركه فارغًا.":"Check your phone number or leave it blank.");return;
  }
  if(!client.current){try{const stored=localStorage.getItem("ordersawa-feedback-client");client.current=stored&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)?stored:clientUuid();localStorage.setItem("ordersawa-feedback-client",client.current);}catch{client.current=clientUuid();}}
  const content={clientId:client.current,stars,comment:comment.trim(),customerName:name.trim(),customerPhone:phone.trim()},signature=JSON.stringify(content);
  if(attempt.current?.signature!==signature)attempt.current={signature,id:clientUuid()};
  setBusy(true);
  try{
   const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL??"http://localhost:5000"}/public/menus/${encodeURIComponent(restaurant.slug)}/feedback`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...content,requestId:attempt.current!.id})});
   if(!response.ok){setError(response.status===429?(ar?"تم إرسال عدة تقييمات مؤخرًا. حاول لاحقًا.":"Too many submissions. Please try later."):(ar?"تعذر استلام التقييم. حاول مجددًا.":"Could not receive your feedback. Please try again."));return;}
   const receipt=await response.json();if((receipt.data??receipt).accepted!==true)throw Error("Invalid receipt");setReceived(true);
  }catch{setError(ar?"تعذر الاتصال. بقيت ملاحظتك محفوظة هنا للمحاولة مجددًا.":"Connection failed. Your text is still here so you can retry.");}
  finally{setBusy(false);}
 }
 return <div className="public-info-content" dir={ar?"rtl":"ltr"} lang={language}>
  {kind==="about"?<section className="public-about-content">
   {drawerAbout?<>
    {about.description?<p className="drawer-about-description">{about.description}</p>:null}
    {about.description && (about.address || about.mapsUrl)?<hr className="drawer-about-divider"/>:null}
    {about.address || about.mapsUrl?<div className="drawer-about-location">
     {about.mapsUrl?<a className="drawer-about-map" href={about.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={ar?"موقع المطعم على خرائط Google":"Restaurant location on Google Maps"}><MapPin size={22}/></a>:<span className="drawer-about-pin" aria-hidden="true"><MapPin size={22}/></span>}
     {about.address?<div className="drawer-about-location-text"><span className="drawer-about-label">{ar?"العنوان":"Address"}</span><p className="public-about-address">{about.address}</p></div>:<span className="drawer-about-location-text">{ar?"عرض الموقع على خرائط Google":"View location on Google Maps"}</span>}
    </div>:null}
   </>:<>
   {about.description?<p>{about.description}</p>:null}
   {about.address?<p className="public-about-address">{about.address}</p>:null}
   {about.mapsUrl?<a className="social-link public-maps-link" href={about.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={ar?"موقع المطعم على خرائط Google":"Restaurant location on Google Maps"}><MapPin size={22}/></a>:null}
   </>}
  </section>:received?<p role="status">{ar?"تم استلام تقييمك، شكرًا لك.":"Thank you. Your feedback was received."}</p>:<form noValidate onSubmit={submit}>
   <fieldset className="public-rating-stars"><legend>{ar?"كيف كانت تجربتك معنا؟":"How was your experience with us?"}</legend><div>
    {[1,2,3,4,5].map(value=><label key={value} className={value<=stars?"selected":""}><input type="radio" name="public-rating" value={value} checked={stars===value} onChange={()=>{setStars(value);setError("");}} aria-label={ar?`${value} نجوم`:`${value} stars`}/><Star size={31} fill={value<=stars?"currentColor":"none"}/></label>)}
   </div></fieldset>
   {prompt?<p className="public-feedback-prompt" aria-live="polite">{prompt}</p>:null}
   <label className="public-feedback-field">{ar?`ملاحظتك${feedbackRequiresComment(stars)?"":" (اختياري)"}`:`Your feedback${feedbackRequiresComment(stars)?"":" (optional)"}`}<textarea rows={4} maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)} required={feedbackRequiresComment(stars)}/></label>
   {mode==="DASHBOARD"?<>
    <label className="public-feedback-field">{ar?"الاسم (اختياري)":"Name (optional)"}<input autoComplete="name" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="public-feedback-field">{ar?"رقم الهاتف (اختياري)":"Phone (optional)"}<input type="tel" autoComplete="tel" maxLength={32} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
   </>:null}
   {error?<p role="alert" className="public-feedback-error">{error}</p>:null}
   <button className={`public-feedback-submit ${mode==="WHATSAPP"?"via-whatsapp":""}`} type="submit" disabled={busy}>
    {mode==="WHATSAPP"?<SocialIcon type="whatsapp"/>:null}{busy?(ar?"جارٍ الإرسال…":"Sending…"):mode==="WHATSAPP"?(ar?"إرسال عبر واتساب":"Send via WhatsApp"):(ar?"إرسال التقييم":"Send rating")}
   </button>
  </form>}
 </div>;
}
