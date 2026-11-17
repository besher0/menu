import { feedbackRequiresComment, googleMapsShareUrl, validFeedbackStars } from "@menu/shared";
import { sidebarWhatsappPhoneUrl } from "./sidebar-social-links";
export function formatAboutAddress(cityValue?:string|null,addressValue?:string|null) {
  const city=cityValue?.trim()||"",address=addressValue?.trim()||"";
  if(!city || !address)return city || address;
  return `${city} - ${address}`;
}
export function publicAboutInfo(restaurant: {city?:string|null;googleMapsUrl?:string|null;description?:string|null;branches?:Array<{city?:string|null;address?:string|null;latitude?:number|null;longitude?:number|null}>}) {
  const branch=restaurant.branches?.[0];
  const description=restaurant.description?.trim()||"",address=formatAboutAddress(branch?.city?.trim() || restaurant.city,branch?.address),mapsUrl=googleMapsShareUrl(restaurant.googleMapsUrl);
  return {description,address,mapsUrl,visible:!!(description||address||mapsUrl)};
}
export function feedbackError(stars:number,comment:string,ar:boolean):string|null {
  if(!validFeedbackStars(stars))return ar?"اختر عدد النجوم أولًا.":"Choose a star rating first.";
  if(feedbackRequiresComment(stars)&&!comment.trim())return ar?"اكتب ملاحظتك قبل الإرسال.":"Please add your feedback before submitting.";
  if(comment.length>2000)return ar?"الملاحظة طويلة جدًا.":"Your feedback is too long.";
  return null;
}
export function feedbackWhatsappUrl(phone:string|null|undefined,stars:number,comment:string,ar:boolean):string|null {
  const base=sidebarWhatsappPhoneUrl(phone);
  if(!base||feedbackError(stars,comment,ar))return null;
  const text=(ar?`تقييم المطعم: ${stars} من 5 نجوم`:`Restaurant rating: ${stars} out of 5 stars`)
    +(comment.trim()?`\n\n${ar?"الملاحظة:":"Feedback:"}\n${comment.trim()}`:"");
  return base+"?text="+encodeURIComponent(text);
}
