"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ImagePlus, Loader2, Save } from "lucide-react";
import { API_URL } from "@/lib/client-api";
import { authHeaders } from "@/lib/session";
import type * as React from "react";

type BackgroundType = "COLOR" | "IMAGE" | "TEXTURE" | "PATTERN" | "GRADIENT";

type FormState = {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  color: string;
  backgroundColorA: string;
  backgroundColorB: string;
  backgroundType: BackgroundType;
  backgroundValue: string;
  backgroundOverlay: string;
  backgroundCss: string;
  visualScrollEnabled: boolean;
};

type CategoryPreviewStyle = React.CSSProperties & {
  "--category-preview-x": string;
  "--category-preview-y": string;
  "--category-preview-icon-width": string;
  "--category-preview-icon-height": string;
};

const initialForm: FormState = {
  name: "",
  slug: "",
  description: "",
  imageUrl: "",
  imageX: 78,
  imageY: 50,
  imageWidth: 34,
  imageHeight: 34,
  color: "#ed1f2b",
  backgroundColorA: "#ed1f2b",
  backgroundColorB: "#7f1118",
  backgroundType: "COLOR",
  backgroundValue: "",
  backgroundOverlay: "",
  backgroundCss: "",
  visualScrollEnabled: false
};

export function CategoryForm({ categoryId }: { categoryId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "success" | "error">(categoryId ? "loading" : "idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!categoryId) return;

    async function loadCategory() {
      try {
        const response = await fetch(`${API_URL}/dashboard/categories/${categoryId}`, {
          headers: authHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? "تعذر تحميل القسم.");
        }

        const category = payload?.data ?? payload;
        const imagePosition = parseImagePosition(category.imagePosition);
        const colors = inferBackgroundColors(category.backgroundType, category.backgroundValue, category.backgroundCss, category.color);
        setForm({
          name: category.name ?? "",
          slug: category.slug ?? "",
          description: category.description ?? "",
          imageUrl: category.imageUrl ?? "",
          imageX: imagePosition.x,
          imageY: imagePosition.y,
          imageWidth: category.imageWidth ?? 34,
          imageHeight: category.imageHeight ?? 34,
          color: category.color ?? "#ed1f2b",
          backgroundColorA: colors.a,
          backgroundColorB: colors.b,
          backgroundType: category.backgroundType ?? "COLOR",
          backgroundValue: category.backgroundValue ?? "",
          backgroundOverlay: category.backgroundOverlay ?? "",
          backgroundCss: category.backgroundCss ?? "",
          visualScrollEnabled: category.visualScrollEnabled ?? false
        });
        setStatus("idle");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "تعذر تحميل القسم.");
        setStatus("error");
      }
    }

    void loadCategory();
  }, [categoryId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>, target: "imageUrl" | "backgroundValue") {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadStatus("uploading");
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "IMAGE");
      body.append("altText", form.name || file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: authHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع الصورة.");
      }

      update(target, payload?.data?.url ?? payload?.url ?? "");
      if (target === "backgroundValue") {
        update("backgroundType", "IMAGE");
      }
      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الصورة.");
    } finally {
      event.target.value = "";
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const visualSettings = buildVisualSettings(form);
      const response = await fetch(`${API_URL}/dashboard/categories${categoryId ? `/${categoryId}` : ""}`, {
        method: categoryId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({
          ...form,
          slug: form.slug || undefined,
          imagePosition: `${form.imageX},${form.imageY}`,
          color: form.backgroundColorA,
          backgroundValue: visualSettings.backgroundValue,
          backgroundOverlay: form.backgroundOverlay || undefined,
          backgroundCss: visualSettings.backgroundCss
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? (categoryId ? "تعذر تعديل القسم." : "تعذر إضافة القسم."));
      }

      setStatus("success");
      setMessage(categoryId ? "تم تعديل القسم بنجاح." : "تم إضافة القسم بنجاح.");
      setTimeout(() => router.push("/dashboard/categories"), 500);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : (categoryId ? "تعذر تعديل القسم." : "تعذر إضافة القسم."));
    }
  }

  if (status === "loading") {
    return (
      <div className="restaurant-dashboard-page">
        <div className="restaurant-empty">
          <Loader2 className="spin" size={28} />
          <b>يتم تحميل القسم</b>
        </div>
      </div>
    );
  }

  const isAllCategory = form.slug === "all";

  return (
    <form className="restaurant-dashboard-page category-form-page" onSubmit={submit}>
      <div className="form-header-row">
        <Link className="back-link" href="/dashboard/categories">
          <ArrowRight size={18} />
          رجوع للأقسام
        </Link>
        <button className="settings-save" type="submit" disabled={status === "saving"}>
          {status === "saving" ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          {categoryId ? "تعديل القسم" : "حفظ القسم"}
        </button>
      </div>

      <section className="settings-card">
        <h2>{categoryId ? "تعديل قسم" : "إضافة قسم"}</h2>
        <div className="form-grid two">
          <label className="field">
            <span>اسم القسم</span>
            <input required disabled={isAllCategory} value={form.name} onChange={(event) => update("name", event.target.value)} />
          </label>
          <label className="field">
            <span>الرابط المختصر</span>
            <input disabled={isAllCategory} value={form.slug} onChange={(event) => update("slug", event.target.value)} placeholder="مثال: shawarma" />
          </label>
          <label className="field textarea full">
            <span>الوصف</span>
            <textarea value={form.description} onChange={(event) => update("description", event.target.value)} />
          </label>
          <label className="field">
            <span>اللون الأساسي</span>
            <input type="color" value={form.backgroundColorA} onChange={(event) => update("backgroundColorA", event.target.value)} />
          </label>
          <div className="category-position-controls">
            <label className="field">
              <span>X: {form.imageX}%</span>
              <input min="0" max="100" type="range" value={form.imageX} onChange={(event) => update("imageX", Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Y: {form.imageY}%</span>
              <input min="0" max="100" type="range" value={form.imageY} onChange={(event) => update("imageY", Number(event.target.value))} />
            </label>
            <label className="field">
              <span>عرض الأيقونة</span>
              <input min="12" max="140" type="number" value={form.imageWidth} onChange={(event) => update("imageWidth", Number(event.target.value))} />
            </label>
            <label className="field">
              <span>ارتفاع الأيقونة</span>
              <input min="12" max="140" type="number" value={form.imageHeight} onChange={(event) => update("imageHeight", Number(event.target.value))} />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2>الصورة والخلفية</h2>
        <div className="category-form-media">
          <div
            className="logo-preview category-form-preview"
            style={{
              ...previewStyle(form),
              "--category-preview-x": `${form.imageX}%`,
              "--category-preview-y": `${form.imageY}%`,
              "--category-preview-icon-width": `${form.imageWidth}px`,
              "--category-preview-icon-height": `${form.imageHeight}px`
            } as CategoryPreviewStyle}
          >
            {form.imageUrl ? <img src={assetUrl(form.imageUrl)} alt="" /> : <ImagePlus size={42} />}
          </div>
          <div className="form-grid two">
            <label className="field full">
              <span>صورة/أيقونة القسم</span>
              <input accept="image/*" disabled={uploadStatus === "uploading"} type="file" onChange={(event) => void uploadImage(event, "imageUrl")} />
              <input value={form.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} placeholder="سيظهر الرابط بعد الرفع" />
            </label>
            <label className="field">
              <span>نوع الخلفية</span>
              <select value={form.backgroundType} onChange={(event) => update("backgroundType", event.target.value as BackgroundType)}>
                <option value="COLOR">لون</option>
                <option value="IMAGE">صورة</option>
                <option value="TEXTURE">تكستشر</option>
                <option value="PATTERN">نقشة</option>
                <option value="GRADIENT">تدرج</option>
              </select>
            </label>
            <label className="field">
              <span>رفع صورة خلفية</span>
              <input accept="image/*" disabled={uploadStatus === "uploading"} type="file" onChange={(event) => void uploadImage(event, "backgroundValue")} />
            </label>
            <label className="field">
              <span>لون الخلفية الأول</span>
              <input type="color" value={form.backgroundColorA} onChange={(event) => update("backgroundColorA", event.target.value)} />
            </label>
            <label className="field">
              <span>لون الخلفية الثاني</span>
              <input type="color" value={form.backgroundColorB} onChange={(event) => update("backgroundColorB", event.target.value)} />
            </label>
            <label className="checkbox-row full">
              <input checked={form.visualScrollEnabled} onChange={(event) => update("visualScrollEnabled", event.target.checked)} type="checkbox" />
              <span>تفعيل السكرول/النقشة الوهمية</span>
            </label>
          </div>
        </div>
      </section>

      {message ? <p className={status === "error" ? "form-message" : "form-message success"}>{message}</p> : null}
    </form>
  );
}

function assetUrl(url: string) {
  return url.startsWith("/uploads/") ? `${API_URL}${url}` : url;
}

function previewStyle(form: FormState) {
  const { backgroundValue, backgroundCss } = buildVisualSettings(form);
  const value = backgroundValue || form.backgroundColorA;
  if (backgroundCss) return { background: backgroundCss };
  if (form.backgroundType === "IMAGE" || form.backgroundType === "TEXTURE") {
    return { backgroundImage: `url(${assetUrl(value)})`, backgroundSize: "cover", backgroundPosition: "center" };
  }
  if (form.backgroundType === "GRADIENT" || form.backgroundType === "PATTERN") return { background: value };
  return { backgroundColor: value };
}

function parseImagePosition(value?: string | null) {
  if (!value || value === "end") return { x: 78, y: 50 };
  if (value === "start") return { x: 22, y: 50 };
  const [rawX = "78", rawY = "50"] = value.split(",");
  return {
    x: clampPercent(Number(rawX) || 78),
    y: clampPercent(Number(rawY) || 50)
  };
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function inferBackgroundColors(type?: BackgroundType, value?: string | null, css?: string | null, fallback?: string | null) {
  const matches = `${value ?? ""} ${css ?? ""}`.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
  return {
    a: matches[0] ?? fallback ?? "#ed1f2b",
    b: matches[1] ?? "#7f1118"
  };
}

function buildVisualSettings(form: FormState) {
  if (form.backgroundType === "IMAGE" || form.backgroundType === "TEXTURE") {
    return {
      backgroundValue: form.backgroundValue || form.backgroundColorA,
      backgroundCss: undefined
    };
  }

  if (form.backgroundType === "GRADIENT") {
    return {
      backgroundValue: `linear-gradient(135deg, ${form.backgroundColorA}, ${form.backgroundColorB})`,
      backgroundCss: undefined
    };
  }

  if (form.backgroundType === "PATTERN") {
    return {
      backgroundValue: `linear-gradient(135deg, ${form.backgroundColorA}, ${form.backgroundColorB})`,
      backgroundCss: `repeating-linear-gradient(135deg, ${form.backgroundColorA} 0 12px, ${form.backgroundColorB} 12px 24px)`
    };
  }

  return {
    backgroundValue: form.backgroundColorA,
    backgroundCss: undefined
  };
}
