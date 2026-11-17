import { describe,expect,it } from "vitest";
import { feedbackError,feedbackWhatsappUrl,publicAboutInfo } from "./public-feedback-model";
describe("optional About and unified feedback presentation",()=>{
 it.each([
  [{description:"نبذة"},true], [{branches:[{address:"عنوان"}]},true], [{googleMapsUrl:"https://maps.app.goo.gl/Test"},true],
  [{description:"نبذة",branches:[{address:"عنوان"}]},true], [{description:"نبذة",branches:[{address:"عنوان",latitude:33,longitude:36}]},true],
  [{},false],[{description:"  ",branches:[{address:"  "}]},false],[{branches:[{latitude:0,longitude:0}]},false]
 ])("hides empty About content without placeholders",(restaurant,visible)=>expect(publicAboutInfo(restaurant).visible).toBe(visible));
 it.each([1,2,3])("requires a trimmed comment at %s stars",stars=>{expect(feedbackError(stars,"  ",true)).toBeTruthy();expect(feedbackError(stars,"ملاحظة",true)).toBeNull();});
 it.each([4,5])("allows an empty positive comment at %s stars",stars=>expect(feedbackError(stars,"",true)).toBeNull());
 it("never defaults an unselected rating",()=>expect(feedbackError(0,"hello",false)).toBeTruthy());
 it.each([null,"","123","javascript:alert(1)"])("rejects unavailable WhatsApp number %s",phone=>expect(feedbackWhatsappUrl(phone,5,"",true)).toBeNull());
 it("encodes Arabic/mixed feedback without sending or including order data",()=>{
  const href=feedbackWhatsappUrl("+49 (170) 123-4567",2,"الطلب cold & متأخر؟",true)!;
  expect(href.startsWith("https://wa.me/491701234567?text=")).toBe(true);
  expect(new URL(href).searchParams.get("text")).toBe("تقييم المطعم: 2 من 5 نجوم\n\nالملاحظة:\nالطلب cold & متأخر؟");
  expect(new URL(feedbackWhatsappUrl("00491701234567",5,"",true)!).searchParams.get("text")).toBe("تقييم المطعم: 5 من 5 نجوم");
 });
});
