import { describe, expect, it } from "vitest";
import { publicUploadUrl } from "./public-upload-url";
import { PublicMenuService } from "../modules/public-menu/public-menu.service";
import { ProductsService } from "../modules/products/products.service";

describe("Legacy uploaded image delivery through a prefixed public API", () => {
  for (const base of ["https://menu.example", "https://menu.example/", "https://menu.example/api", "https://menu.example/api/", "https://menu.example/v1/api"]) {
    it(`resolves Legacy and freshly uploaded logos exactly once: ${base}`, () => {
      const normalized = base.replace(/\/$/, "");
      const expected = `${normalized}/uploads/logo.png`;
      expect(publicUploadUrl("/uploads/logo.png", base)).toBe(expected);
      expect(publicUploadUrl("http://localhost:5000/uploads/logo.png", base)).toBe(expected);
      expect(publicUploadUrl(expected, base)).toBe(expected);
      expect(publicUploadUrl(new URL(expected).pathname, base)).toBe(expected);
      expect(publicUploadUrl(publicUploadUrl(expected, base), base)).toBe(expected);
      expect(publicUploadUrl(`${expected}?v=2#logo`, base)).toBe(`${expected}?v=2#logo`);
    });
  }
  it("preserves non-local references, empty values and malformed input without fetching", () => {
    for (const input of ["https://cdn.example/image.png", "https://cdn.example/photos/uploads/logo.png", "not a URL/uploads/logo", "//cdn.example/uploads/logo.png"])
      expect(publicUploadUrl(input, "https://menu.example/api")).toBe(input);
    expect(publicUploadUrl(null, "https://menu.example/api")).toBeNull();
    expect(publicUploadUrl(undefined, "https://menu.example/api")).toBeNull();
    expect(publicUploadUrl("", "https://menu.example/api")).toBeNull();
  });
  for (const Service of [PublicMenuService, ProductsService]) {
    it(`${Service.name} uses the same idempotent serialization for logos/product media`, () => {
      const context = { config: { get: (name: string) => name === "API_ORIGIN" ? "https://menu.example/api" : undefined } };
      const serialize = (Service.prototype as unknown as {publicAssetUrl: (value: string) => string}).publicAssetUrl;
      expect(serialize.call(context, "https://menu.example/api/uploads/logo.png")).toBe("https://menu.example/api/uploads/logo.png");
      expect(serialize.call(context, "/uploads/logo.png")).toBe("https://menu.example/api/uploads/logo.png");
    });
  }
});
