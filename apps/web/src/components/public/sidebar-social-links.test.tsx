import React from "react";
import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {sidebarSocialLinks,sidebarWhatsappPhoneUrl} from "./sidebar-social-links";
import {DrawerSocialLinks} from "./public-menu-client";
const settings={whatsappPhone:"+49 (170) 123-4567",instagramUrl:"https://instagram.com/order-demo",facebookUrl:"https://facebook.com/order-demo",tiktokUrl:"https://tiktok.com/@order-demo"};
describe("Sidebar contacts use only their own configured sources",()=>{
 it.each([0,1,2,3,4])("renders exactly %s links without empty slots or captions",count=>{
  const links=sidebarSocialLinks(settings).slice(0,count),html=renderToStaticMarkup(<DrawerSocialLinks links={links} onNavigate={()=>{}}/>);
  if(!count){expect(html).toBe("");return}expect(html.match(/<a /g)).toHaveLength(count);expect(html.match(/<svg /g)).toHaveLength(count);expect(html).not.toContain("<span");for(const link of links)expect(html).toContain('href="'+link.href+'"');
 });
 it("ignores a legacy WhatsApp URL when the phone is absent",()=>expect(sidebarSocialLinks({whatsappUrl:"https://wa.me/999999999"} as never)).toEqual([]));
 it("ignores a different legacy WhatsApp URL when the phone exists",()=>expect(sidebarSocialLinks({...settings,whatsappUrl:"https://wa.me/999999999"} as never)[0].href).toBe("https://wa.me/491701234567"));
 it.each(["+49 (170) 123-4567","0049 170 1234567","٤٩١٧٠١٢٣٤٥٦٧","۴۹۱۷۰۱۲۳۴۵۶۷","491701234567"])("normalizes international phone %s",value=>expect(sidebarWhatsappPhoneUrl(value)).toBe("https://wa.me/491701234567"));
 it.each(["","  ","not a number","https://wa.me/491701234567","javascript:12345678","+000","123","0991234567","1234567890123456"])("does not publish invalid or URL-based phone %s",value=>expect(sidebarWhatsappPhoneUrl(value)).toBeNull());
 it("preserves supported social handles and full URLs",()=>{expect(sidebarSocialLinks({instagramUrl:"@demo",facebookUrl:"facebook.com/demo",tiktokUrl:"https://www.tiktok.com/@demo"}).map(x=>x.href)).toEqual(["https://instagram.com/demo","https://facebook.com/demo","https://www.tiktok.com/@demo"])});
 it("uses the actual WhatsApp phone-in-bubble glyph",()=>{const html=renderToStaticMarkup(<DrawerSocialLinks links={sidebarSocialLinks({whatsappPhone:settings.whatsappPhone})} onNavigate={()=>{}}/>);expect(html).toContain('viewBox="0 0 16 16"');expect(html).toContain("M13.601 2.326");expect(html).toContain('target="_blank"');expect(html).toContain('rel="noreferrer"')});
});
