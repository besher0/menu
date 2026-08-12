"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Loader2, Save } from "lucide-react";
import { preferredRestaurantUrl } from "@/lib/public-routes";
import { adminAuthHeaders, setStoredRestaurant } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type RestaurantFormState = {
  name: string;
  slug: string;
  type: string;
  city: string;
  country: string;
  whatsappPhone: string;
  logoUrl: string;
  heroImageUrl: string;
  planKey: string;
  templateKey: "default" | "vertigo";
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  copyFromRestaurantId: string;
};

type RestaurantOption = {
  id: string;
  name: string;
  slug: string;
};

export function RestaurantForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [message, setMessage] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantsStatus, setRestaurantsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [form, setForm] = useState<RestaurantFormState>({
    name: "",
    slug: "",
    type: "مطعم",
    city: "حلب",
    country: "سوريا",
    whatsappPhone: "",
    logoUrl: "",
    heroImageUrl: "",
    planKey: "BASIC",
    templateKey: "default",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "password123",
    copyFromRestaurantId: ""
  });
  const sourceRestaurant = restaurants.find((restaurant) => restaurant.id === form.copyFromRestaurantId);

  useEffect(() => {
    let mounted = true;

    async function loadRestaurants() {
      try {
        const response = await fetch(`${API_URL}/admin/restaurants`, {
          headers: adminAuthHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? "Could not load restaurants.");
        }

        if (mounted) {
          setRestaurants(payload?.data ?? payload ?? []);
          setRestaurantsStatus("ready");
        }
      } catch {
        if (mounted) {
          setRestaurants([]);
          setRestaurantsStatus("error");
        }
      }
    }

    void loadRestaurants();

    return () => {
      mounted = false;
    };
  }, []);

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
          ...adminAuthHeaders()
        },
        body: JSON.stringify({
          ...form,
          slug: form.slug || undefined,
          copyFromRestaurantId: form.copyFromRestaurantId || undefined,
          ownerPassword: form.ownerPassword || undefined
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر إنشاء المطعم. تأكد من تشغيل API وقاعدة البيانات وتسجيل الدخول كأدمن.");
      }

      if (payload?.data?.id && payload.data.slug) {
        setStoredRestaurant({
          id: payload.data.id,
          slug: payload.data.slug,
          name: payload.data.name
        });
      }

      setStatus("success");
      setPublicUrl(payload?.data?.publicUrl ?? (payload?.data?.slug ? preferredRestaurantUrl(payload.data.slug) : ""));
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
            <span>رابط اللوغو</span>
            <input value={form.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} placeholder="https://..." />
          </label>

          <label>
            <span>صورة واجهة المطعم</span>
            <input value={form.heroImageUrl} onChange={(event) => update("heroImageUrl", event.target.value)} placeholder="https://..." />
          </label>

          <label>
            <span>قالب الواجهة</span>
            <select value={form.templateKey} onChange={(event) => update("templateKey", event.target.value as RestaurantFormState["templateKey"])}>
              <option value="default">القالب الحالي</option>
              <option value="vertigo">Vertigo</option>
            </select>
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

          <label>
            <span>نسخ التصميم من</span>
            <select
              value={form.copyFromRestaurantId}
              disabled={restaurantsStatus === "loading" || restaurants.length === 0}
              onChange={(event) => update("copyFromRestaurantId", event.target.value)}
            >
              <option value="">بدون نسخ</option>
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
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
          <p>فرع رئيسي في {form.city || "المدينة"}، باقة {planName(form.planKey)}، وقالب {form.templateKey === "vertigo" ? "Vertigo" : "القالب الحالي"}.</p>
          {sourceRestaurant ? <p>سيتم نسخ التصميم والصفحات من {sourceRestaurant.name}.</p> : null}
          <b>{preferredRestaurantUrl(form.slug || "auto-slug")}</b>
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
