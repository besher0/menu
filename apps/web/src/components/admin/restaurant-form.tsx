"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Loader2, Save } from "lucide-react";
import { authHeaders } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5010";

type RestaurantFormState = {
  name: string;
  slug: string;
  type: string;
  city: string;
  country: string;
  whatsappPhone: string;
  planKey: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
};

export function RestaurantForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [message, setMessage] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [form, setForm] = useState<RestaurantFormState>({
    name: "",
    slug: "",
    type: "مطعم",
    city: "حلب",
    country: "سوريا",
    whatsappPhone: "",
    planKey: "BASIC",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "password123"
  });

  function update<K extends keyof RestaurantFormState>(key: K, value: RestaurantFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    setPublicUrl("");

    try {
      const response = await fetch(`${API_URL}/admin/restaurants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({
          ...form,
          slug: form.slug || undefined,
          ownerPassword: form.ownerPassword || undefined
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر إنشاء المطعم. تأكد من تشغيل API وقاعدة البيانات وتسجيل الدخول كأدمن.");
      }

      setStatus("success");
      setPublicUrl(payload?.data?.publicUrl ?? "");
      setMessage("تم إنشاء المطعم وتجهيز المنيو الأساسي بنجاح.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "حدث خطأ أثناء إنشاء المطعم.");
    }
  }

  return (
    <form className="restaurant-form-page" onSubmit={handleSubmit}>
      <section className="products-header">
        <div>
          <Link className="back-link" href="/admin/restaurants">
            <ArrowRight size={18} />
            المطاعم
          </Link>
          <h1>إضافة مطعم جديد</h1>
          <p>ينشئ المطعم مع مالك وفرع رئيسي وباقة وثيم ومنيو منشور ورابط QR أساسي.</p>
        </div>
        <button className="primary-action" type="submit" disabled={status === "saving"}>
          {status === "saving" ? <Loader2 className="spin" size={22} /> : <Save size={22} />}
          إنشاء المطعم
        </button>
      </section>

      <section className="restaurant-form-layout">
        <div className="product-form-card">
          <label>
            <span>اسم المطعم</span>
            <input value={form.name} onChange={(event) => update("name", event.target.value)} required />
          </label>

          <label>
            <span>الرابط slug</span>
            <input value={form.slug} onChange={(event) => update("slug", event.target.value)} placeholder="auto" />
          </label>

          <label>
            <span>النوع</span>
            <input value={form.type} onChange={(event) => update("type", event.target.value)} />
          </label>

          <label>
            <span>المدينة</span>
            <input value={form.city} onChange={(event) => update("city", event.target.value)} />
          </label>

          <label>
            <span>الدولة</span>
            <input value={form.country} onChange={(event) => update("country", event.target.value)} />
          </label>

          <label>
            <span>واتساب</span>
            <input value={form.whatsappPhone} onChange={(event) => update("whatsappPhone", event.target.value)} />
          </label>

          <label>
            <span>الباقة</span>
            <select value={form.planKey} onChange={(event) => update("planKey", event.target.value)}>
              <option value="BASIC">الأساسية</option>
              <option value="PRO">الاحترافية</option>
              <option value="PREMIUM">الذهبية</option>
            </select>
          </label>

          <label>
            <span>اسم المالك</span>
            <input value={form.ownerName} onChange={(event) => update("ownerName", event.target.value)} required />
          </label>

          <label>
            <span>بريد المالك</span>
            <input
              value={form.ownerEmail}
              onChange={(event) => update("ownerEmail", event.target.value)}
              type="email"
              required
            />
          </label>

          <label>
            <span>كلمة مرور المالك</span>
            <input value={form.ownerPassword} onChange={(event) => update("ownerPassword", event.target.value)} />
          </label>

          {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}
          {publicUrl ? (
            <Link className="created-link" href={publicUrl}>
              فتح الموقع العام: {publicUrl}
            </Link>
          ) : null}
        </div>

        <aside className="product-preview-card">
          <div>
            <Building2 size={32} />
            <span>ما سيتم إنشاؤه</span>
          </div>
          <h2>{form.name || "مطعم جديد"}</h2>
          <p>فرع رئيسي في {form.city || "المدينة"}، باقة {planName(form.planKey)}، وثيم أحمر افتراضي.</p>
          <b>{form.slug ? `/m/${form.slug}` : "/m/auto-slug"}</b>
        </aside>
      </section>
    </form>
  );
}

function planName(key: string) {
  if (key === "PRO") return "احترافية";
  if (key === "PREMIUM") return "ذهبية";
  return "أساسية";
}
