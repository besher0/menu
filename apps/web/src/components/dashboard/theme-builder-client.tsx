"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MonitorSmartphone, RotateCcw, Save } from "lucide-react";
import {
  ABO_MALEK_THEME,
  FOOTER_VARIANTS,
  HEADER_VARIANTS,
  PUBLIC_TEMPLATE_KEYS,
  ThemeSettings,
  themeToCssVariables
} from "@menu/shared";
import { authHeaders } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type ThemeResponse = {
  data?: {
    settings?: ThemeSettings;
    customCss?: string | null;
  } | null;
  settings?: ThemeSettings;
  customCss?: string | null;
};

type ProductOpenMode = "MODAL" | "PAGE";
type PublicUiSettings = NonNullable<ThemeSettings["publicUi"]> & {
  whatsappOrderingEnabled?: boolean;
};
type SettingsResponse = {
  data?: {
    restaurant?: {
      productOpenMode?: ProductOpenMode;
    };
  } | null;
  restaurant?: {
    productOpenMode?: ProductOpenMode;
  };
};

const colorFields: Array<{ key: keyof ThemeSettings["colors"]; label: string }> = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted" },
  { key: "border", label: "Border" }
];

const PUBLIC_TEMPLATE_LABELS: Record<string, string> = {
  default: "القالب الحالي",
  vertigo: "Vertigo"
};

const HEADER_VARIANT_LABELS: Record<string, string> = {
  default: "الهيدر الحالي",
  vertigo: "هيدر Vertigo"
};

const FOOTER_VARIANT_LABELS: Record<string, string> = {
  default: "الفوتر الحالي",
  "floating-pill": "فوتر عائم"
};

export function ThemeBuilderClient() {
  const [theme, setTheme] = useState<ThemeSettings>(ABO_MALEK_THEME);
  const [customCss, setCustomCss] = useState("");
  const [productOpenMode, setProductOpenMode] = useState<ProductOpenMode>("MODAL");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const publicUi = theme.publicUi as PublicUiSettings | undefined;
  const previewStyle = useMemo(() => themeToCssVariables(theme) as React.CSSProperties, [theme]);

  useEffect(() => {
    let alive = true;

    async function loadTheme() {
      try {
        const response = await fetch(`${API_URL}/dashboard/theme`, {
          headers: authHeaders()
        });

        if (!response.ok) {
          throw new Error("تعذر تحميل الثيم من الـ API، سيتم عرض الثيم التجريبي.");
        }

        const payload = (await response.json()) as ThemeResponse;
        const data = payload.data ?? payload;
        const settingsResponse = await fetch(`${API_URL}/dashboard/settings`, {
          headers: authHeaders(),
          cache: "no-store"
        });
        const settingsPayload = settingsResponse.ok ? ((await settingsResponse.json()) as SettingsResponse) : null;
        const settingsData = settingsPayload?.data ?? settingsPayload;

        if (!alive) {
          return;
        }

        if (data?.settings) {
          setTheme(mergeTheme(data.settings));
        }
        setCustomCss(data?.customCss ?? "");
        setProductOpenMode(settingsData?.restaurant?.productOpenMode === "PAGE" ? "PAGE" : "MODAL");
        setStatus("idle");
      } catch (error) {
        if (!alive) {
          return;
        }
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "تعذر تحميل الثيم.");
      }
    }

    void loadTheme();

    return () => {
      alive = false;
    };
  }, []);

  function updateColor(key: keyof ThemeSettings["colors"], value: string) {
    setTheme((current) => ({
      ...current,
      colors: {
        ...current.colors,
        [key]: value
      }
    }));
  }

  function updateRadius(key: keyof ThemeSettings["radius"], value: string) {
    setTheme((current) => ({
      ...current,
      radius: {
        ...current.radius,
        [key]: value
      }
    }));
  }

  function updateLayout<K extends keyof ThemeSettings["layout"]>(key: K, value: ThemeSettings["layout"][K]) {
    setTheme((current) => ({
      ...current,
      layout: {
        ...current.layout,
        [key]: value
      }
    }));
  }

  function updatePublicUi<K extends keyof PublicUiSettings>(key: K, value: PublicUiSettings[K]) {
    setTheme((current) => ({
      ...current,
      publicUi: {
        ...current.publicUi,
        [key]: value
      }
    }));
  }

  function applyPublicTemplate(template: PublicUiSettings["template"]) {
    setTheme((current) => ({
      ...current,
      layout: {
        ...current.layout,
        categoryProductListLayout: template === "vertigo" ? "single" : current.layout.categoryProductListLayout
      },
      publicUi: {
        ...current.publicUi,
        template,
        headerVariant: template === "vertigo" ? "vertigo" : "default",
        footerVariant: template === "vertigo" ? "floating-pill" : "default"
      }
    }));
  }

  async function saveTheme() {
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/theme`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ settings: theme, customCss })
      });

      if (!response.ok) {
        throw new Error("لم يتم حفظ الثيم. تأكد من تسجيل الدخول وأن الباقة تدعم CUSTOM_THEMES.");
      }

      const settingsResponse = await fetch(`${API_URL}/dashboard/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ productOpenMode })
      });

      if (!settingsResponse.ok) {
        throw new Error("Theme saved, but product open mode could not be saved.");
      }

      setStatus("success");
      setMessage("تم حفظ الثيم وربطه بالمطعم الحالي.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر حفظ الثيم.");
    }
  }

  return (
    <div className="theme-builder-page">
      <section className="builder-top">
        <div>
          <span className="eyebrow">Theme Builder</span>
          <h1>محرر ثيم واجهة المستخدم</h1>
          <p>اضبط الألوان، الحواف، واتجاه العرض، ثم شاهد النتيجة فوراً على نموذج المنيو.</p>
        </div>
        <div className="builder-actions">
          <button type="button" onClick={() => setTheme(ABO_MALEK_THEME)}>
            <RotateCcw size={20} />
            Reset
          </button>
          <button className="publish" type="button" onClick={saveTheme} disabled={status === "saving"}>
            {status === "saving" ? <Loader2 className="spin" size={20} /> : <Save size={20} />}
            حفظ الثيم
          </button>
        </div>
      </section>

      {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}

      <section className="theme-workspace">
        <aside className="theme-controls">
          <section>
            <h2>الألوان</h2>
            <div className="theme-color-grid">
              {colorFields.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <div>
                    <input
                      aria-label={field.label}
                      type="color"
                      value={theme.colors[field.key]}
                      onChange={(event) => updateColor(field.key, event.target.value)}
                    />
                    <input
                      value={theme.colors[field.key]}
                      onChange={(event) => updateColor(field.key, event.target.value)}
                    />
                  </div>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2>الشكل</h2>
            <div className="theme-fields">
              <label>
                <span>Card radius</span>
                <input value={theme.radius.card} onChange={(event) => updateRadius("card", event.target.value)} />
              </label>
              <label>
                <span>Button radius</span>
                <input value={theme.radius.button} onChange={(event) => updateRadius("button", event.target.value)} />
              </label>
              <label>
                <span>Section radius</span>
                <input value={theme.radius.section} onChange={(event) => updateRadius("section", event.target.value)} />
              </label>
            </div>
          </section>

          <section>
            <h2>واجهة المستخدم</h2>
            <div className="theme-fields">
              <label>
                <span>قالب العرض العام</span>
                <select
                  value={theme.publicUi?.template ?? "default"}
                  onChange={(event) =>
                    applyPublicTemplate(event.target.value as NonNullable<ThemeSettings["publicUi"]>["template"])
                  }
                >
                  {PUBLIC_TEMPLATE_KEYS.map((template) => (
                    <option key={template} value={template}>
                      {PUBLIC_TEMPLATE_LABELS[template] ?? template}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>شكل الهيدر</span>
                <select
                  value={theme.publicUi?.headerVariant ?? "default"}
                  onChange={(event) =>
                    updatePublicUi("headerVariant", event.target.value as NonNullable<ThemeSettings["publicUi"]>["headerVariant"])
                  }
                >
                  {HEADER_VARIANTS.map((variant) => (
                    <option key={variant} value={variant}>
                      {HEADER_VARIANT_LABELS[variant] ?? variant}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>شكل الفوتر</span>
                <select
                  value={theme.publicUi?.footerVariant ?? "default"}
                  onChange={(event) =>
                    updatePublicUi("footerVariant", event.target.value as NonNullable<ThemeSettings["publicUi"]>["footerVariant"])
                  }
                >
                  {FOOTER_VARIANTS.map((variant) => (
                    <option key={variant} value={variant}>
                      {FOOTER_VARIANT_LABELS[variant] ?? variant}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="theme-color-grid">
              <label>
                <span>Product placeholder</span>
                <div>
                  <input
                    aria-label="Product placeholder"
                    type="color"
                    value={theme.publicUi?.productImagePlaceholderBackground ?? "#e5e7eb"}
                    onChange={(event) => updatePublicUi("productImagePlaceholderBackground", event.target.value)}
                  />
                  <input
                    value={theme.publicUi?.productImagePlaceholderBackground ?? "#e5e7eb"}
                    onChange={(event) => updatePublicUi("productImagePlaceholderBackground", event.target.value)}
                  />
                </div>
              </label>
              <label>
                <span>Mood label color</span>
                <div>
                  <input
                    aria-label="Mood label color"
                    type="color"
                    value={theme.publicUi?.moodChipLabelColor ?? "#ffffff"}
                    onChange={(event) => updatePublicUi("moodChipLabelColor", event.target.value)}
                  />
                  <input
                    value={theme.publicUi?.moodChipLabelColor ?? "#ffffff"}
                    onChange={(event) => updatePublicUi("moodChipLabelColor", event.target.value)}
                  />
                </div>
              </label>
            </div>
            <div className="theme-fields">
              <label>
                <span>Mood label font size</span>
                <input
                  value={theme.publicUi?.moodChipLabelFontSize ?? "16px"}
                  onChange={(event) => updatePublicUi("moodChipLabelFontSize", event.target.value)}
                  placeholder="16px"
                />
              </label>
              <label>
                <span>طريقة فتح المنتج</span>
                <select value={productOpenMode} onChange={(event) => setProductOpenMode(event.target.value as ProductOpenMode)}>
                  <option value="MODAL">بوب أب</option>
                  <option value="PAGE">صفحة تفاصيل المنتج</option>
                </select>
              </label>
            </div>
            <div className="theme-segments">
              <button
                className={publicUi?.whatsappOrderingEnabled !== false ? "active" : ""}
                type="button"
                onClick={() => updatePublicUi("whatsappOrderingEnabled", true)}
              >
                تشغيل السلة وواتساب
              </button>
              <button
                className={publicUi?.whatsappOrderingEnabled === false ? "active" : ""}
                type="button"
                onClick={() => updatePublicUi("whatsappOrderingEnabled", false)}
              >
                إطفاء السلة وواتساب
              </button>
            </div>
          </section>

          <section>
            <h2>التخطيط</h2>
            <div className="theme-segments">
              <button
                className={theme.layout.direction === "rtl" ? "active" : ""}
                type="button"
                onClick={() => updateLayout("direction", "rtl")}
              >
                RTL
              </button>
              <button
                className={theme.layout.direction === "ltr" ? "active" : ""}
                type="button"
                onClick={() => updateLayout("direction", "ltr")}
              >
                LTR
              </button>
            </div>
            <div className="theme-segments three">
              {(["compact", "image-first", "banner"] as const).map((mode) => (
                <button
                  key={mode}
                  className={theme.layout.productCard === mode ? "active" : ""}
                  type="button"
                  onClick={() => updateLayout("productCard", mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="theme-segments">
              {([
                { key: "single", label: "منتج بكل سطر" },
                { key: "double", label: "منتجين بكل سطر" }
              ] as const).map((mode) => (
                <button
                  key={mode.key}
                  className={(theme.layout.categoryProductListLayout ?? "double") === mode.key ? "active" : ""}
                  type="button"
                  onClick={() => updateLayout("categoryProductListLayout", mode.key)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>Custom CSS</h2>
            <textarea
              rows={6}
              value={customCss}
              onChange={(event) => setCustomCss(event.target.value)}
              placeholder=".public-screen { ... }"
            />
          </section>
        </aside>

        <aside className="theme-preview-wrap">
          <div className="theme-preview-head">
            <MonitorSmartphone size={22} />
            <span>Live preview</span>
            {status === "loading" ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          </div>
          <div className="theme-phone" dir={theme.layout.direction} style={previewStyle}>
            <div className="theme-hero">
              <span>مطعمك</span>
              <h2>شو مزاجك اليوم؟</h2>
              <p>برغر، شاورما، ومقبلات جاهزة للطلب عبر واتساب.</p>
              <button>اطلب الآن</button>
            </div>
            <div className="theme-chip-row">
              <span>برغر</span>
              <span>شاورما</span>
              <span>مشروبات</span>
            </div>
            <div className={`theme-products ${theme.layout.productCard}`}>
              {["كرانشي برغر", "وجبة زنجر", "بطاطا تشيز"].map((item, index) => (
                <article key={item}>
                  <div>{index + 1}</div>
                  <section>
                    <h3>{item}</h3>
                    <p>وصف قصير للمنتج يظهر هنا داخل بطاقة المنيو.</p>
                    <strong>{18 + index * 4},000 ل.س</strong>
                  </section>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function mergeTheme(theme: ThemeSettings): ThemeSettings {
  return {
    ...ABO_MALEK_THEME,
    ...theme,
    colors: { ...ABO_MALEK_THEME.colors, ...theme.colors },
    typography: { ...ABO_MALEK_THEME.typography, ...theme.typography },
    radius: { ...ABO_MALEK_THEME.radius, ...theme.radius },
    layout: { ...ABO_MALEK_THEME.layout, ...theme.layout },
    publicUi: { ...ABO_MALEK_THEME.publicUi, ...theme.publicUi }
  };
}
