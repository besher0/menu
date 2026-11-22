import { describe, expect, it } from "vitest";
import { bannerSection } from "./banner-section";

const menu = (slug: string, id: string, isHome = true, isActive = true) => ({
  slug, pages: [{ isHome, sections: [{ id, type: "HERO", isActive }] }]
});

describe("merchant and public banner source", () => {
  it("uses the main menu even when an imported home appears first", () => {
    expect(bannerSection([menu("imported", "old"), menu("main-menu", "current")])?.id).toBe("current");
  });
  it("supports an imported home when the primary menu has no home hero", () => {
    expect(bannerSection([menu("main-menu", "subpage", false), menu("imported", "current")])?.id).toBe("current");
  });
  it("keeps an inactive primary hero authoritative instead of resurrecting another menu's banners", () => {
    expect(bannerSection([menu("imported", "other"), menu("main-menu", "disabled", true, false)])?.isActive).toBe(false);
  });
  it("returns no source for an empty menu or a non-home hero", () => {
    expect(bannerSection()).toBeUndefined();
    expect(bannerSection([menu("main-menu", "subpage", false)])).toBeUndefined();
  });
});
