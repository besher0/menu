import { describe, expect, it } from "vitest";
import { isDemoPreviewRoute } from "../../lib/demo-preview-routes";

describe("protected Demo production-build routing", () => {
  it("allows the Demo menu and login on the loopback or existing preview host", () => {
    for (const host of ["127.0.0.1:3102", "localhost:3102", "rydtest.ordersawa.com"]) {
      for (const path of ["/login", "/dashboard", "/m/preview-ordersawa", "/m/preview-ordersawa/menu", "/m/preview-ordersawa/cart"]) {
        expect(isDemoPreviewRoute("1", host, path)).toBe(true);
      }
    }
  });
  it("does not change normal Production routing", () => {
    for (const enabled of [undefined, "0"]) {
      expect(isDemoPreviewRoute(enabled, "rydtest.ordersawa.com", "/login")).toBe(false);
      expect(isDemoPreviewRoute(enabled, "127.0.0.1", "/m/preview-ordersawa")).toBe(false);
    }
  });
  it("rejects other hosts and other restaurant paths", () => {
    for (const host of ["restaurant.ordersawa.com", "rydtest.ordersawa.com.evil.invalid", null]) {
      expect(isDemoPreviewRoute("1", host, "/m/preview-ordersawa/menu")).toBe(false);
    }
    for (const path of ["/m/another-restaurant", "/m/preview-ordersawa-other", "/login-other"]) {
      expect(isDemoPreviewRoute("1", "127.0.0.1", path)).toBe(false);
    }
  });
});
