"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MonitorSmartphone, RotateCcw, Save } from "lucide-react";
import { ABO_MALEK_THEME, ThemeSettings, themeToCssVariables } from "@menu/shared";
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

const colorFields: Array<{ key: keyof ThemeSettings["colors"]; label: string }> = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted" },
  { key: "border", label: "Border" }
];

export function ThemeBuilderClient() {
  const [theme, setTheme] = useState<ThemeSettings>(ABO_MALEK_THEME);
  const [customCss, setCustomCss] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

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

        if (!alive) {
          return;
        }

        if (data?.settings) {
          setTheme(mergeTheme(data.settings));
        }
        setCustomCss(data?.customCss ?? "");
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
    layout: { ...ABO_MALEK_THEME.layout, ...theme.layout }
  };
}
