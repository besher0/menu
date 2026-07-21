"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2, Plus, Store } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { StatCard } from "./stat-card";

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  type?: string | null;
  isActive: boolean;
  logoUrl?: string | null;
  createdAt: string;
  plan?: string | null;
  planKey?: string | null;
  counts?: {
    branches: number;
    products: number;
    orders: number;
  };
};

type Plan = {
  key: string;
  name: string;
};

export function RestaurantsClient() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadRestaurants() {
      setStatus("loading");
      setMessage("");

      try {
        const [restaurantsData, plansData] = await Promise.all([
          apiFetch<Restaurant[]>("/admin/restaurants"),
          apiFetch<Plan[]>("/admin/subscriptions").catch(() => [])
        ]);

        if (mounted) {
          setRestaurants(restaurantsData);
          setPlans(plansData);
          setStatus("ready");
        }
      } catch (error) {
        if (mounted) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "تعذر تحميل المطاعم.");
        }
      }
    }

    void loadRestaurants();

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const active = restaurants.filter((restaurant) => restaurant.isActive).length;
    const inactive = restaurants.length - active;
    const products = restaurants.reduce((total, restaurant) => total + (restaurant.counts?.products ?? 0), 0);

    return { active, inactive, products };
  }, [restaurants]);

  function dashboardHref(restaurant: Restaurant) {
    const params = new URLSearchParams({
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name
    });

    return `/dashboard?${params.toString()}`;
  }

  async function updatePlan(restaurant: Restaurant, planKey: string) {
    const plan = plans.find((item) => item.key === planKey);
    setSavingPlanId(restaurant.id);
    setMessage("");

    try {
      const updatedSubscription = await apiFetch<{ plan: string; planKey: string }>(`/admin/restaurants/${restaurant.id}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey })
      });

      setRestaurants((current) =>
        current.map((item) =>
          item.id === restaurant.id
            ? { ...item, plan: updatedSubscription.plan ?? plan?.name ?? item.plan, planKey: updatedSubscription.planKey ?? planKey }
            : item
        )
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تغيير اشتراك المطعم.");
    } finally {
      setSavingPlanId(null);
    }
  }

  return (
    <>
      <div className="admin-grid four">
        <StatCard label="إجمالي المطاعم" value={String(restaurants.length)} note="مطاعم محفوظة" icon={Store} />
        <StatCard label="المطاعم الفعالة" value={String(stats.active)} note="تعمل الآن" icon={Store} />
        <StatCard label="المطاعم الموقوفة" value={String(stats.inactive)} note="غير مفعلة" icon={Store} />
        <StatCard label="إجمالي المنتجات" value={String(stats.products)} note="ضمن كل المطاعم" icon={Store} />
      </div>

      <div className="toolbar-row">
        <Link className="primary-action" href="/admin/restaurants/new">
          <Plus size={22} />
          إضافة مطعم
        </Link>
        <button className="secondary-action" type="button">
          <Download size={22} />
          تصدير
        </button>
      </div>

      <section className="data-card full">
        {status === "loading" ? (
          <div className="empty-state">
            <Loader2 className="spin" size={28} />
            <b>يتم تحميل المطاعم</b>
          </div>
        ) : null}

        {status === "error" ? <EmptyState title="تعذر تحميل المطاعم" text={message} /> : null}
        {status === "ready" && message ? <p className="form-message">{message}</p> : null}

        {status === "ready" && restaurants.length === 0 ? (
          <EmptyState title="لا توجد مطاعم" text="ابدأ بإضافة مطعم جديد، وبعدها ستظهر قائمة المطاعم هنا." />
        ) : null}

        {status === "ready" && restaurants.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>المطعم</th>
                <th>المدينة</th>
                <th>الباقة</th>
                <th>المنتجات</th>
                <th>الحالة</th>
                <th>الرابط</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((restaurant) => (
                <tr key={restaurant.id}>
                  <td>
                    <span className="table-avatar" />
                    <strong>{restaurant.name}</strong>
                  </td>
                  <td>{restaurant.city ?? "-"}</td>
                  <td>
                    <select
                      className="table-select"
                      value={restaurant.planKey ?? ""}
                      disabled={savingPlanId === restaurant.id || plans.length === 0}
                      onChange={(event) => void updatePlan(restaurant, event.target.value)}
                    >
                      <option value="">{restaurant.plan ?? "-"}</option>
                      {plans.map((plan) => (
                        <option key={plan.key} value={plan.key}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{restaurant.counts?.products ?? 0}</td>
                  <td>
                    <span className={restaurant.isActive ? "status-pill on" : "status-pill off"}>
                      {restaurant.isActive ? "فعال" : "موقوف"}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions-inline">
                      <Link
                        className="table-link"
                        href={dashboardHref(restaurant)}
                      >
                        <Store size={16} />
                        داشبورد المطعم
                      </Link>
                      <Link className="table-link" href={`/m/${restaurant.slug}`}>
                        <ExternalLink size={16} />
                        فتح
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
