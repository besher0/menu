import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductConfigurator } from "./product-configurator";

describe("ProductConfigurator", () => {
  it("renders an Arabic RTL loading state without any order action", () => {
    const html = renderToStaticMarkup(
      <ProductConfigurator restaurantSlug="demo" productId="pizza" currency="EGP" />
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("جارٍ تحميل خيارات الصنف");
    expect(html).not.toContain("إضافة إلى السلة");
    expect(html).not.toContain("واتساب");
  });

  it("contains an explicit mobile layout and accessible selection controls", () => {
    const css = readFileSync(new URL("./product-configurator.module.css", import.meta.url), "utf8");
    const source = readFileSync(new URL("./product-configurator.tsx", import.meta.url), "utf8");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("grid-template-columns: repeat(2");
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('role={radioMode ? "radiogroup"');
    expect(source).toContain("الإضافة تستخدم Quote من الخادم");
    expect(source).toContain("getPublicProductQuote");
  });
});
