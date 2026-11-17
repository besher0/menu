import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicInfoContent } from "./public-info-dialog";
import { publicAboutInfo } from "./public-feedback-model";
import type { PublicMenuData } from "@/lib/api";

describe("Drawer About independent optional fields", () => {
 for (const language of ["ar", "en"] as const) {
  it.each(Array.from({ length: 8 }, (_, bits) => bits))(`${language} renders combination %s without empty blocks`, bits => {
   const restaurant = { description: bits & 4 ? "Description نبذة" : "", branches: [{ address: bits & 2 ? "حلب الجديدة" : "" }], googleMapsUrl: bits & 1 ? "https://maps.app.goo.gl/Test" : "" } as PublicMenuData["restaurant"];
   const html = renderToStaticMarkup(createElement(PublicInfoContent, { kind: "about", restaurant, language, drawerAbout: true }));
   expect(publicAboutInfo(restaurant).visible).toBe(bits !== 0);
   expect(html.includes('class="drawer-about-description"')).toBe(!!(bits & 4));
   expect(html.includes('class="public-about-address"')).toBe(!!(bits & 2));
   expect(html.includes('class="drawer-about-map"')).toBe(!!(bits & 1));
   expect(html.includes('class="drawer-about-label"')).toBe(!!(bits & 2));
   if (bits & 1) expect(html).toContain('rel="noopener noreferrer"');
  });
 }
 it.each(["javascript:alert(1)", "http://maps.google.com/", "https://maps.google.com.evil.test/", "https://user@maps.google.com/"])("never renders unsafe Maps-only URL %s", googleMapsUrl => {
  const restaurant = { googleMapsUrl } as PublicMenuData["restaurant"];
  expect(publicAboutInfo(restaurant).visible).toBe(false);
  expect(renderToStaticMarkup(createElement(PublicInfoContent, { kind: "about", restaurant, language: "ar", drawerAbout: true }))).not.toContain("<a ");
 });
 it("preserves the city prefix even when the detailed area starts with the same name", () => {
  expect(publicAboutInfo({city:"حلب",branches:[{address:"حلب الجديدة، مفرق مشفى الشهباء"}]}).address).toBe("حلب - حلب الجديدة، مفرق مشفى الشهباء");
 });
});
