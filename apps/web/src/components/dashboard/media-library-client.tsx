"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Plus, RefreshCcw, Rotate3D, Save, Settings2, View } from "lucide-react";
import { authHeaders } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5010";

type MediaType = "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON";
type ImageRuleTarget = "PRODUCT_IMAGE" | "CATEGORY_IMAGE" | "HERO_IMAGE" | "GALLERY_IMAGE" | "LOGO" | "ICON";

type MediaVariant = {
  id: string;
  kind: string;
  url: string;
  width?: number | null;
  height?: number | null;
  format: string;
  quality?: number | null;
};

type MediaAsset = {
  id: string;
  url: string;
  originalUrl?: string | null;
  type: MediaType;
  altText?: string | null;
  filename?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  provider: string;
  blurDataUrl?: string | null;
  createdAt: string;
  variants?: MediaVariant[];
};

type ImageRule = {
  id: string;
  target: ImageRuleTarget;
  maxWidth?: number | null;
  maxHeight?: number | null;
  jpegQuality: number;
  webpQuality: number;
  cropMode: string;
  aspectRatio?: string | null;
  generateAvif: boolean;
  generateWebp: boolean;
  lazyLoad: boolean;
  progressive: boolean;
};

type RuleDraft = {
  target: ImageRuleTarget;
  maxWidth: string;
  maxHeight: string;
  jpegQuality: string;
  webpQuality: string;
  cropMode: string;
  aspectRatio: string;
  generateAvif: boolean;
  generateWebp: boolean;
  lazyLoad: boolean;
  progressive: boolean;
};

type ApiPayload<T> = {
  data?: T;
};

const typeOptions: Array<{ value: MediaType; label: string }> = [
  { value: "IMAGE", label: "صورة" },
  { value: "SVG_ICON", label: "أيقونة SVG" },
  { value: "PNG_ICON", label: "أيقونة PNG" },
  { value: "MODEL_3D", label: "ملف 3D" },
  { value: "VR_PANORAMA", label: "بانوراما VR" }
];

const targetLabels: Record<ImageRuleTarget, string> = {
  PRODUCT_IMAGE: "صور المنتجات",
  CATEGORY_IMAGE: "صور التصنيفات",
  HERO_IMAGE: "صور الهيرو",
  GALLERY_IMAGE: "المعرض",
  LOGO: "الشعارات",
  ICON: "الأيقونات"
};

const defaultRuleDraft: RuleDraft = {
  target: "PRODUCT_IMAGE",
  maxWidth: "1920",
  maxHeight: "1440",
  jpegQuality: "82",
  webpQuality: "82",
  cropMode: "contain",
  aspectRatio: "",
  generateAvif: true,
  generateWebp: true,
  lazyLoad: true,
  progressive: true
};

export function MediaLibraryClient() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [rules, setRules] = useState<ImageRule[]>([]);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(defaultRuleDraft);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<MediaType>("IMAGE");
  const [altText, setAltText] = useState("");
  const [filter, setFilter] = useState<MediaType | "ALL">("ALL");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error" | "success">("loading");
  const [message, setMessage] = useState("");

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.target === ruleDraft.target),
    [ruleDraft.target, rules]
  );

  useEffect(() => {
    void loadAssets();
  }, [filter]);

  useEffect(() => {
    void loadRules();
  }, []);

  useEffect(() => {
    if (!selectedRule) {
      return;
    }

    setRuleDraft({
      target: selectedRule.target,
      maxWidth: String(selectedRule.maxWidth ?? ""),
      maxHeight: String(selectedRule.maxHeight ?? ""),
      jpegQuality: String(selectedRule.jpegQuality),
      webpQuality: String(selectedRule.webpQuality),
      cropMode: selectedRule.cropMode,
      aspectRatio: selectedRule.aspectRatio ?? "",
      generateAvif: selectedRule.generateAvif,
      generateWebp: selectedRule.generateWebp,
      lazyLoad: selectedRule.lazyLoad,
      progressive: selectedRule.progressive
    });
  }, [selectedRule?.id]);

  async function loadAssets() {
    setStatus("loading");
    setMessage("");

    try {
      const query = filter === "ALL" ? "" : `?type=${filter}`;
      const response = await fetch(`${API_URL}/dashboard/media${query}`, {
        headers: authHeaders()
      });

      if (!response.ok) {
        throw new Error("تعذر تحميل مكتبة الوسائط.");
      }

      const payload = (await response.json()) as ApiPayload<MediaAsset[]> | MediaAsset[];
      setAssets(Array.isArray(payload) ? payload : payload.data ?? []);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل مكتبة الوسائط.");
    }
  }

  async function loadRules() {
    try {
      const response = await fetch(`${API_URL}/dashboard/media/rules`, {
        headers: authHeaders()
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ApiPayload<ImageRule[]> | ImageRule[];
      setRules(Array.isArray(payload) ? payload : payload.data ?? []);
    } catch {
      // The media library can still work if rules are not available yet.
    }
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/media`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ url, type, altText })
      });

      if (!response.ok) {
        throw new Error("تعذر إضافة الملف. تأكد أن الباقة تدعم نوع الوسائط المختار.");
      }

      const payload = (await response.json()) as ApiPayload<MediaAsset> | MediaAsset;
      const asset = unwrapAsset(payload);
      setAssets((current) => [asset, ...current]);
      setUrl("");
      setAltText("");
      setStatus("success");
      setMessage("تمت إضافة الوسائط وإنشاء النسخ المحسنة.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر إضافة الوسائط.");
    }
  }

  async function uploadAsset() {
    if (!file) {
      setStatus("error");
      setMessage("اختر ملفاً أولاً.");
      return;
    }

    setStatus("saving");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      formData.append("altText", altText || file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: formData
      });

      if (!response.ok) {
        throw new Error("تعذر رفع الملف. تحقق من الباقة وحجم الملف.");
      }

      const payload = (await response.json()) as ApiPayload<MediaAsset> | MediaAsset;
      const asset = unwrapAsset(payload);
      setAssets((current) => [asset, ...current]);
      setFile(null);
      setAltText("");
      setStatus("success");
      setMessage("تم رفع الملف وإضافته إلى محرك الوسائط.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الوسائط.");
    }
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/media/rules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({
          target: ruleDraft.target,
          maxWidth: toNumber(ruleDraft.maxWidth),
          maxHeight: toNumber(ruleDraft.maxHeight),
          jpegQuality: toNumber(ruleDraft.jpegQuality),
          webpQuality: toNumber(ruleDraft.webpQuality),
          cropMode: ruleDraft.cropMode,
          aspectRatio: ruleDraft.aspectRatio || undefined,
          generateAvif: ruleDraft.generateAvif,
          generateWebp: ruleDraft.generateWebp,
          lazyLoad: ruleDraft.lazyLoad,
          progressive: ruleDraft.progressive
        })
      });

      if (!response.ok) {
        throw new Error("تعذر حفظ قواعد الصور.");
      }

      const payload = (await response.json()) as ApiPayload<ImageRule> | ImageRule;
      const savedRule = unwrapRule(payload);
      setRules((current) => [savedRule, ...current.filter((rule) => rule.target !== savedRule.target)]);
      setStatus("success");
      setMessage("تم حفظ قواعد الصور لهذا النوع.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر حفظ قواعد الصور.");
    }
  }

  return (
    <div className="media-page">
      <section className="builder-top">
        <div>
          <span className="eyebrow">Media Engine</span>
          <h1>مكتبة الوسائط ومحرك الصور</h1>
          <p>أدر الصور والأيقونات وملفات 3D من مكان واحد مع نسخ محسنة، تحميل تدريجي، وقواعد منفصلة لكل نوع.</p>
        </div>
        <div className="builder-actions">
          <button type="button" onClick={loadAssets} disabled={status === "loading"}>
            {status === "loading" ? <Loader2 className="spin" size={20} /> : <RefreshCcw size={20} />}
            تحديث
          </button>
        </div>
      </section>

      {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}

      <section className="media-layout">
        <div className="media-sidebar">
          <form className="media-form" onSubmit={createAsset}>
            <h2>إضافة وسائط</h2>
            <label>
              <span>النوع</span>
              <select value={type} onChange={(event) => setType(event.target.value as MediaType)}>
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>الرابط</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} required />
            </label>
            <label>
              <span>أو ارفع ملف</span>
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <label>
              <span>النص البديل</span>
              <input value={altText} onChange={(event) => setAltText(event.target.value)} />
            </label>
            <button className="primary-action" type="submit" disabled={status === "saving"}>
              {status === "saving" ? <Loader2 className="spin" size={20} /> : <Plus size={20} />}
              إضافة من رابط
            </button>
            <button className="outline-action" type="button" onClick={uploadAsset} disabled={status === "saving"}>
              رفع الملف
            </button>
          </form>

          <form className="media-form media-rules-form" onSubmit={saveRule}>
            <h2>
              <Settings2 size={18} />
              قواعد الصور
            </h2>
            <label>
              <span>النوع</span>
              <select
                value={ruleDraft.target}
                onChange={(event) => setRuleDraft((current) => ({ ...current, target: event.target.value as ImageRuleTarget }))}
              >
                {(Object.keys(targetLabels) as ImageRuleTarget[]).map((target) => (
                  <option key={target} value={target}>
                    {targetLabels[target]}
                  </option>
                ))}
              </select>
            </label>
            <div className="media-rule-grid">
              <label>
                <span>أقصى عرض</span>
                <input value={ruleDraft.maxWidth} onChange={(event) => setRuleDraft((current) => ({ ...current, maxWidth: event.target.value }))} />
              </label>
              <label>
                <span>أقصى ارتفاع</span>
                <input value={ruleDraft.maxHeight} onChange={(event) => setRuleDraft((current) => ({ ...current, maxHeight: event.target.value }))} />
              </label>
              <label>
                <span>JPEG</span>
                <input value={ruleDraft.jpegQuality} onChange={(event) => setRuleDraft((current) => ({ ...current, jpegQuality: event.target.value }))} />
              </label>
              <label>
                <span>WEBP</span>
                <input value={ruleDraft.webpQuality} onChange={(event) => setRuleDraft((current) => ({ ...current, webpQuality: event.target.value }))} />
              </label>
            </div>
            <label>
              <span>نمط القص</span>
              <select value={ruleDraft.cropMode} onChange={(event) => setRuleDraft((current) => ({ ...current, cropMode: event.target.value }))}>
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
              </select>
            </label>
            <label>
              <span>النسبة</span>
              <input value={ruleDraft.aspectRatio} onChange={(event) => setRuleDraft((current) => ({ ...current, aspectRatio: event.target.value }))} placeholder="4:3" />
            </label>
            <div className="media-switches">
              {[
                ["generateWebp", "WebP"],
                ["generateAvif", "AVIF"],
                ["lazyLoad", "Lazy"],
                ["progressive", "Progressive"]
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(ruleDraft[key as keyof RuleDraft])}
                    onChange={(event) => setRuleDraft((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <button className="primary-action" type="submit" disabled={status === "saving"}>
              <Save size={18} />
              حفظ القواعد
            </button>
          </form>
        </div>

        <section className="media-panel">
          <div className="media-tabs">
            {(["ALL", "IMAGE", "SVG_ICON", "PNG_ICON", "MODEL_3D", "VR_PANORAMA"] as const).map((value) => (
              <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                {value === "ALL" ? "الكل" : typeOptions.find((option) => option.value === value)?.label}
              </button>
            ))}
          </div>
          <div className="media-grid">
            {assets.map((asset) => (
              <article className="media-card" key={asset.id}>
                <div className="media-thumb">
                  {asset.type === "IMAGE" || asset.type === "PNG_ICON" || asset.type === "SVG_ICON" ? (
                    <img src={bestPreviewUrl(asset)} alt={asset.altText ?? "Media asset"} loading="lazy" />
                  ) : (
                    mediaIcon(asset.type)
                  )}
                </div>
                <section>
                  <h2>{asset.altText || asset.originalFilename || asset.type}</h2>
                  <p>{asset.url}</p>
                  <div className="media-card-meta">
                    <span>{asset.provider}</span>
                    <span>{asset.variants?.length ?? 0} نسخ</span>
                  </div>
                </section>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function mediaIcon(type: MediaType) {
  if (type === "MODEL_3D") {
    return <Rotate3D size={42} />;
  }

  if (type === "VR_PANORAMA") {
    return <View size={42} />;
  }

  return <ImageIcon size={42} />;
}

function bestPreviewUrl(asset: MediaAsset) {
  return asset.variants?.find((variant) => variant.kind === "SMALL")?.url ?? asset.blurDataUrl ?? asset.url;
}

function unwrapAsset(payload: ApiPayload<MediaAsset> | MediaAsset): MediaAsset {
  return (payload as ApiPayload<MediaAsset>).data ?? (payload as MediaAsset);
}

function unwrapRule(payload: ApiPayload<ImageRule> | ImageRule): ImageRule {
  return (payload as ApiPayload<ImageRule>).data ?? (payload as ImageRule);
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
