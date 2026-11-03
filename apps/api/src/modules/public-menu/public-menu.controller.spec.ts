import "reflect-metadata";
import { HEADER_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { PublicMenuController } from "./public-menu.controller";

function cacheControl(method: keyof PublicMenuController) {
  const headers = Reflect.getMetadata(HEADER_METADATA, PublicMenuController.prototype[method]) as
    Array<{ name: string; value: string }> | undefined;
  return headers?.find((header) => header.name.toLowerCase() === "cache-control")?.value;
}

describe("public menu cache safety", () => {
  it("does not share host-sensitive menus between tenants", () => {
    expect(cacheControl("menuByHost")).toContain("no-store");
    expect(cacheControl("menu")).toContain("no-store");
  });

  it("does not cache price quotes or product configurations", () => {
    expect(cacheControl("productQuote")).toContain("no-store");
    expect(cacheControl("productConfiguration")).toContain("no-store");
  });

  it("does not cache analytics or WhatsApp checkout responses", () => {
    for (const method of ["track", "createWhatsappOrder", "prepareWhatsappCheckout", "confirmWhatsappCheckout"] as const) {
      expect(cacheControl(method)).toContain("no-store");
    }
  });
});
