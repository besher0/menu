import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PublicImage } from "./public-image";
import { canOptimizePublicImage, safePublicImageSource } from "./public-image-model";
import policy from "../../../public-image-policy.json";

describe("public image delivery boundaries", () => {
  it.each(["javascript:alert(1)","//evil.test/x.jpg","https://user:pass@images.pexels.com/photos/1/x.jpg","bogus", "https://ok.test\\evil.jpg", "", null])("rejects malformed/unsafe image %s", src => {
    expect(safePublicImageSource(src)).toBe("");
  });
  it.each(["http://127.0.0.1/a.jpg","https://169.254.169.254/x.jpg","https://images.pexels.com.evil.test/photos/1/a.jpg","https://res.cloudinary.com/a/image/fetch/https://local/a.jpg","https://res.cloudinary.com/a/image/upload/a.svg","/uploads/a.jpg","data:image/png;base64,YQ==","https://images.pexels.com/photos/1/a.jpg#fragment"])('never server-optimizes %s', src => expect(canOptimizePublicImage(src)).toBe(false));
  it.each(["https://images.pexels.com/photos/1/a.jpeg?w=1280","https://res.cloudinary.com/restaurant/image/upload/v123/menu/a.jpg"])("permits original public raster %s", src => expect(canOptimizePublicImage(src)).toBe(true));
  it("does not invent transformations for unknown sources or uploads",()=>{
    const html=renderToStaticMarkup(<PublicImage src="/uploads/food.jpg" alt="وجبة" />);
    expect(html).toContain('src="/uploads/food.jpg"');expect(html).not.toContain("srcSet=");expect(html).not.toMatch(/\s(?:width|height)=/);
  });
  it("emits responsive candidates only for canonical bundled raster paths", () => {
    for (const src of ["/assets/public/menu/pizza.jpg", "/assets/brand/logo.webp"]) {
      const html = renderToStaticMarkup(<PublicImage src={src} alt="Food" sizes="100vw" />);
      expect(html).toContain("srcSet=");
      expect(html).toContain("/_next/image?");
    }
    for (const src of ["/assets/public/../private.jpg", "/assets/public/%2e%2e/a.jpg",
      "/assets/public/a.jpg?x=1", "/assets/public/a.jpg#x", "/assets/public/a.svg", "/assets/publicity/a.jpg"]) {
      expect(canOptimizePublicImage(src)).toBe(false);
    }
  });
  it("preserves original intrinsic Legacy geometry even on supported providers",()=>{
    const src='https://images.pexels.com/photos/1/a.jpeg?w=1280';
    const html=renderToStaticMarkup(<PublicImage src={src} alt="Food" preserveIntrinsicSize />);
    expect(html).not.toContain('srcSet=');expect(html).not.toContain('/_next/image');expect(html).not.toMatch(/\s(?:width|height)=/);
  });
  it("reserves the exact original ratio when optimizing an intrinsic-height menu row",()=>{
    const known=renderToStaticMarkup(<PublicImage src="/assets/public/food.jpg" alt="Food" sizes="142px"
      preserveIntrinsicSize originalDimensions={{width:1280,height:853}} />);
    expect(known).toContain('srcSet=');
    expect(known).toContain('aspect-ratio:1280 / 853');
  });
  it("keeps placeholder accessible without requests for missing URLs",()=>{
    const html=renderToStaticMarkup(<PublicImage alt="وجبة" />);expect(html).toContain('role="img"');expect(html).not.toContain('<img');
  });
  it("does not expose authenticated/local hosts or unrestricted quality/width",()=>{
    expect(policy.remotePatterns.map(p=>p.hostname)).toEqual(['images.pexels.com','res.cloudinary.com']);expect(policy.localPatterns).toEqual([{pathname:'/assets/brand/**',search:''},{pathname:'/assets/public/**',search:''}]);expect(policy.qualities).toEqual([75]);expect(Math.max(...policy.deviceSizes)).toBe(1600);expect(policy.maximumResponseBody).toBe(20971520);expect(policy.dangerouslyAllowSVG).toBe(false);
  });
  it("uses one policy for runtime generation and Next authorization",()=>{
    expect(readFileSync('next.config.mjs','utf8')).toContain('./public-image-policy.json');
  });
  it("reserves loading space only in full product details, not loaded choices/popups",()=>{
    const css=readFileSync('src/app/globals.css','utf8');expect(css).toContain('.product-detail .product-sheet > .public-configuration-loading');expect(css).toContain('min-height: calc(100svh - 318px)');
  });
});
