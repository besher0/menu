import { describe, expect, it } from "vitest";
import { feedbackMode, feedbackRequiresComment, restaurantMapsUrl, validFeedbackStars } from "./public-feedback";
describe("public feedback policy",()=>{
 it.each([1,2,3,4,5])("requires the approved comment policy for %s",stars=>{expect(validFeedbackStars(stars)).toBe(true);expect(feedbackRequiresComment(stars)).toBe(stars<=3);});
 it.each([0,6,-1,1.5,NaN,Infinity])("rejects invalid stars %s",stars=>expect(validFeedbackStars(stars)).toBe(false));
 it("allows only the two delivery modes",()=>{expect(feedbackMode("WHATSAPP")).toBe("WHATSAPP");expect(feedbackMode("DASHBOARD")).toBe("DASHBOARD");expect(feedbackMode(null)).toBe("DASHBOARD");});
 it("builds exact coordinates independently of an address, including zero",()=>{expect(restaurantMapsUrl(0,0)).toBe("https://www.google.com/maps/search/?api=1&query=0%2C0");expect(restaurantMapsUrl(33.5138,36.2765)).toContain("33.5138%2C36.2765");});
 it.each([[null,null],[undefined,20],["javascript:alert(1)",20],["33",36],[91,36],[0,181],[NaN,1],[0,Infinity]])("never opens invalid location %s %s",(lat,lon)=>expect(restaurantMapsUrl(lat,lon)).toBeNull());
});

import { googleMapsShareUrl } from "./public-feedback";
describe("Google Maps share link boundary",()=>{
 it.each(["https://maps.app.goo.gl/AbCd", "https://google.com/maps/place/Test", "https://www.google.com/maps?q=33,36", "https://maps.google.com/?q=0,0", "https://goo.gl/maps/test"])("accepts an explicit Maps destination %s",url=>expect(googleMapsShareUrl(url)).toBe(url));
 it.each(["http://google.com/maps", "javascript:alert(1)", "https://google.com.evil.test/maps", "https://evil.test/?next=https://google.com/maps", "https://google.com/url?q=https://evil.test", "https://user@maps.google.com/", "https://maps.app.goo.gl:444/test", "https://google.com/maps\\@evil.test", "//maps.google.com/", "", null])("rejects spoofed/unsafe URL %s",url=>expect(googleMapsShareUrl(url)).toBeNull());
});
