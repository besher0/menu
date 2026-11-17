export type SidebarSocialLink={key:string;label:string;href:string};
type SocialSettings={whatsappPhone?:string|null;instagramUrl?:string|null;facebookUrl?:string|null;tiktokUrl?:string|null};
function normalizeSocialUrl(value:string|null|undefined,host:string):string|null {
 const trimmed=value?.trim();if(!trimmed)return null;
 if(/^https?:\/\//i.test(trimmed))return trimmed;
 const path=trimmed.replace(/^@/,"").replace(/^\/+/, "");
 return path.toLowerCase()===host.toLowerCase()||path.toLowerCase().startsWith(host.toLowerCase()+"/")? "https://"+path : "https://"+host+"/"+path;
}
/** Contact only: accepts international phone formatting, never a separate URL. */
export function sidebarWhatsappPhoneUrl(phone?:string|null):string|null{
 const value=phone?.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0));
 if(!value||!/^\+?[\d\s().-]+$/.test(value))return null;
 const digits=value.replace(/[\s()+.-]/g,"").replace(/^00/,"");
 return /^[1-9]\d{6,14}$/.test(digits)?"https://wa.me/"+digits:null;
}
export function sidebarSocialLinks(settings:SocialSettings):SidebarSocialLink[]{
 return [
  {key:"whatsapp",label:"WhatsApp",href:sidebarWhatsappPhoneUrl(settings.whatsappPhone)},
  {key:"instagram",label:"Instagram",href:normalizeSocialUrl(settings.instagramUrl,"instagram.com")},
  {key:"facebook",label:"Facebook",href:normalizeSocialUrl(settings.facebookUrl,"facebook.com")},
  {key:"tiktok",label:"TikTok",href:normalizeSocialUrl(settings.tiktokUrl,"tiktok.com")}
 ].filter((link):link is SidebarSocialLink=>!!link.href);
}
