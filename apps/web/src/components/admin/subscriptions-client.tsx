"use client";

import { useEffect, useState } from "react";
import { FEATURE_KEYS } from "@menu/shared";
import { Check, Download, Edit3, Loader2, Plus, Save, X } from "lucide-react";
import { apiFetch } from "@/lib/client-api";

type PlanFeature = {
  key: string;
  enabled: boolean;
  limit?: number | null;
};

type Plan = {
  id: string;
  key: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  isActive: boolean;
  restaurants: number;
  features: PlanFeature[];
};

type DraftPlan = {
  id?: string;
  key: string;
  name: string;
  priceMonthly: string;
  priceYearly: string;
  isActive: boolean;
  features: Array<PlanFeature & { limitInput: string }>;
};

const featureLabels: Record<string, string> = {
  PRODUCT_IMAGES: "صور المنتجات",
  PRODUCT_3D_VIEWER: "عرض 3D",
  PRODUCT_VR_VIEWER: "عرض VR",
  CART_ORDERING: "السلة",
  WHATSAPP_ORDERING: "طلبات واتساب",
  PWA_MENU: "تطبيق PWA",
  OFFLINE_MENU_CACHE: "عمل بدون إنترنت",
  CUSTOM_THEMES: "ثيمات مخصصة",
  ADVANCED_THEMES: "ثيمات متقدمة",
  CUSTOM_PAGES: "صفحات مخصصة",
  CUSTOM_COMPONENTS: "مكونات مخصصة",
  ADVANCED_ICONS: "أيقونات متقدمة",
  MULTI_BRANCH: "عدة فروع",
  QR_CODES: "رموز QR",
  CUSTOM_DOMAIN: "دومين خاص",
  WHITE_LABEL: "White label",
  ANALYTICS_BASIC: "تحليلات أساسية",
  ANALYTICS_ADVANCED: "تحليلات متقدمة",
  SEO_BASIC: "SEO أساسي",
  SEO_ADVANCED: "SEO متقدم",
  MENU_VERSIONING: "نسخ المنيو",
  DRAFT_PUBLISH: "مسودات ونشر",
  PLUGIN_MARKETPLACE: "إضافات",
  AI_TOOLS: "أدوات AI",
  MAX_BRANCHES: "حد الفروع",
  MAX_PRODUCTS: "حد المنتجات",
  MAX_MENUS: "حد القوائم"
};

export function SubscriptionsClient() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<DraftPlan | null>(null);

  async function load() {
    try {
      const data = await apiFetch<Plan[]>("/admin/subscriptions");
      setPlans(data);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الباقات.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function planToDraft(plan: Plan): DraftPlan {
    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      priceMonthly: String(plan.priceMonthly ?? 0),
      priceYearly: String(plan.priceYearly ?? 0),
      isActive: plan.isActive,
      features: FEATURE_KEYS.map((key) => {
        const feature = plan.features.find((item) => item.key === key);
        return {
          key,
          enabled: feature?.enabled ?? false,
          limit: feature?.limit ?? null,
          limitInput: feature?.limit == null ? "" : String(feature.limit)
        };
      })
    };
  }

  function newDraft(): DraftPlan {
    return {
      key: "",
      name: "",
      priceMonthly: "0",
      priceYearly: "0",
      isActive: true,
      features: FEATURE_KEYS.map((key) => ({ key, enabled: false, limit: null, limitInput: "" }))
    };
  }

  function updateDraft(patch: Partial<DraftPlan>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateFeature(key: string, patch: Partial<PlanFeature & { limitInput: string }>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            features: current.features.map((feature) => (feature.key === key ? { ...feature, ...patch } : feature))
          }
        : current
    );
  }

  function openDraft(nextDraft: DraftPlan) {
    setDraft(nextDraft);
    setMessage("");
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setMessage("اكتب اسم الباقة قبل الحفظ.");
      return;
    }

    setStatus("saving");
    setMessage("");

    try {
      const body = {
        key: draft.key || undefined,
        name: draft.name,
        priceMonthly: draft.priceMonthly,
        priceYearly: draft.priceYearly,
        isActive: draft.isActive,
        features: draft.features.map((feature) => ({
          key: feature.key,
          enabled: feature.enabled,
          limit: feature.limitInput === "" ? null : Number(feature.limitInput)
        }))
      };
      const saved = await apiFetch<Plan>(draft.id ? `/admin/subscriptions/${draft.id}` : "/admin/subscriptions", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      setPlans((current) => {
        const exists = current.some((plan) => plan.id === saved.id);
        return exists ? current.map((plan) => (plan.id === saved.id ? saved : plan)) : [...current, saved];
      });
      setDraft(null);
      setStatus("ready");
      setMessage("تم حفظ الباقة والميزات بنجاح.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر حفظ الباقة.");
    }
  }

  return (
    <>
      <div className="toolbar-row">
        <button className="primary-action" type="button" onClick={() => openDraft(newDraft())}>
          <Plus size={20} />
          إضافة
        </button>
        <button className="secondary-action" type="button">
          <Download size={20} />
          تصدير
        </button>
        <div className="filter-group">
          <button type="button">الأسعار والميزات مربوطة بالـ API</button>
        </div>
      </div>

      {draft ? (
        <section className="data-card full plan-editor-card">
          <div className="section-heading-row">
            <h2>{draft.id ? "تعديل الباقة" : "إضافة باقة"}</h2>
            <div className="table-actions-inline">
              <button className="secondary-action" type="button" onClick={() => setDraft(null)}>
                <X size={18} />
                إلغاء
              </button>
              <button className="primary-action" type="button" disabled={status === "saving"} onClick={() => void saveDraft()}>
                {status === "saving" ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                حفظ الباقة والميزات
              </button>
            </div>
          </div>

          <div className="form-grid two">
            <label className="field">
              <span>اسم الباقة</span>
              <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
            </label>
            <label className="field">
              <span>المفتاح</span>
              <input disabled={Boolean(draft.id)} value={draft.key} onChange={(event) => updateDraft({ key: event.target.value })} placeholder="اختياري - يولد تلقائياً" />
            </label>
            <label className="field">
              <span>السعر الشهري</span>
              <input type="number" min="0" value={draft.priceMonthly} onChange={(event) => updateDraft({ priceMonthly: event.target.value })} />
            </label>
            <label className="field">
              <span>السعر السنوي</span>
              <input type="number" min="0" value={draft.priceYearly} onChange={(event) => updateDraft({ priceYearly: event.target.value })} />
            </label>
            <label className="checkbox-row full">
              <input checked={draft.isActive} type="checkbox" onChange={(event) => updateDraft({ isActive: event.target.checked })} />
              <span>الباقة فعالة ويمكن ربطها بالمطاعم</span>
            </label>
          </div>

          <div className="plan-feature-grid">
            {draft.features.map((feature) => (
              <article key={feature.key} className={feature.enabled ? "enabled" : ""}>
                <label>
                  <input checked={feature.enabled} type="checkbox" onChange={(event) => updateFeature(feature.key, { enabled: event.target.checked })} />
                  <span>{featureLabels[feature.key] ?? feature.key}</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={feature.limitInput}
                  onChange={(event) => updateFeature(feature.key, { limitInput: event.target.value })}
                  placeholder="Limit"
                />
                {feature.enabled ? <Check size={16} /> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="data-card full">
        {status === "loading" ? (
          <div className="empty-state">
            <Loader2 className="spin" size={28} />
            <b>يتم تحميل الباقات</b>
          </div>
        ) : null}
        {status === "error" && !plans.length ? <EmptyState title="تعذر تحميل الباقات" text={message} /> : null}
        {message && plans.length ? <p className="form-message">{message}</p> : null}
        {status === "ready" && plans.length === 0 ? (
          <EmptyState title="لا توجد باقات" text="أضف أول باقة من زر إضافة." />
        ) : null}
        {plans.length > 0 ? (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th />
                  <th>الباقة</th>
                  <th>السعر الشهري</th>
                  <th>السعر السنوي</th>
                  <th>عدد المطاعم</th>
                  <th>الميزات</th>
                  <th>الحالة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td><input type="checkbox" aria-label={`اختر ${plan.name}`} /></td>
                    <td><span className="plan-pill">{plan.name}</span></td>
                    <td>{plan.priceMonthly}$</td>
                    <td>{plan.priceYearly}$</td>
                    <td>{plan.restaurants}</td>
                    <td>{plan.features.filter((feature) => feature.enabled).length}</td>
                    <td>
                      <span className={plan.isActive ? "status-pill on" : "status-pill off"}>
                        {plan.isActive ? "فعال" : "موقوف"}
                      </span>
                    </td>
                    <td>
                      <button className="table-link" type="button" aria-label="تعديل" onClick={() => openDraft(planToDraft(plan))}>
                        <Edit3 size={18} />
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination-row">
              <span>عرض {plans.length} باقات</span>
              <div><button className="active" type="button">1</button></div>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
