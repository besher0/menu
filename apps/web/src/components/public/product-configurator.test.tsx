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

  it("follows the menu language while loading", () => {
    const html = renderToStaticMarkup(
      <ProductConfigurator restaurantSlug="demo" productId="pizza" currency="SYP" locale="en" showPrices={false} />
    );
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Loading product choices");
    expect(html).not.toContain("جارٍ تحميل");
  });

  it("keeps three sizes in one themed mobile row with accessible selection controls", () => {
    const css = readFileSync(new URL("./product-configurator.module.css", import.meta.url), "utf8");
    const source = readFileSync(new URL("./product-configurator.tsx", import.meta.url), "utf8");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain(".sizeGrid:has(> button:nth-child(3):last-child)");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toContain("var(--color-surface)");
    expect(css).toContain("var(--color-border)");
    expect(css).toContain("var(--color-secondary)");
    expect(css).toContain(":focus-visible");
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('role={radioMode ? "radiogroup"');
    expect(source).toContain("getPublicProductQuote");
    expect(source).toContain("orderingEnabled && preview.valid");
    expect(source).toContain("product-bottom-cart-network");
    expect(css).toContain("var(--color-primary)");
  });

  it("keeps customer copy free of reset and pricing-engine explanations", () => {
    const source = readFileSync(new URL("./product-configurator.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("تكوين مستقل");
    expect(source).not.toContain("تم تجاهل السعر الأساسي");
    expect(source).not.toContain("معاينة فقط");
    expect(source).not.toContain("إعادة الضبط");
    expect(source.indexOf("preview.lines.map")).toBeLessThan(source.indexOf("styles.total"));
    expect(source).toContain("multiplyMoney(preview.total, draftQuantity)");
    expect(source).toContain("displayCurrencyAmount(line.chargedAmount, currency)");
    expect(source).not.toContain('line.included ? say(locale, "مشمول", "Included")');
  });

  it("removes repeated Network headings and routine checkout explanation while preserving safeguards", () => {
    const source = readFileSync(new URL("./product-configurator.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("ستُراجع الأسعار والتوفر مجددًا قبل فتح WhatsApp");
    expect(source).not.toContain("<h2 dir=\"auto\">{envelope.productName}</h2>");
    expect(source).not.toContain("اختر حجمًا واحدًا");
    expect(source).toContain("!checkoutEnabled || !orderingEnabled");
    expect(source).toContain("أسعار هذه القائمة مخفية؛ لا يمكن إضافة الصنف للسلة");
    expect(source).toContain("multiplyMoney(preview.total, draftQuantity)");
    expect(source).toContain("preview.issues.slice(0, 8)");
    expect(source).toContain("option.label.includes(source.name)");
    expect(source).toContain("linked?.groups.length && instance.linkedSelection");
    expect(source).not.toContain("styles.linkedHeading");
    const css = readFileSync(new URL("./product-configurator.module.css", import.meta.url), "utf8");
    expect(css).toContain(".optionSelected > .optionRow .optionLabel i");
    expect(css).not.toContain(".optionSelected .optionLabel i");
  });
});
