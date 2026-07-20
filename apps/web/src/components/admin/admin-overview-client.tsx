"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, Clock, Loader2, ShoppingBag, Store } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { BarChart, DonutChart } from "./charts";
import { StatCard } from "./stat-card";

type DistributionItem = {
  count: number;
};

type NamedDistributionItem = DistributionItem & {
  label?: string;
  plan?: string;
  city?: string;
  income?: number;
};

type Overview = {
  cards: {
    totalIncome: number;
    restaurants: number;
    activeRestaurants: number;
    expiringSoon: number;
    whatsappOrders: number;
    plans: number;
  };
  cityDistribution: Array<{ city: string; count: number }>;
  planDistribution: Array<{ plan: string; count: number }>;
  planIncomeDistribution?: Array<{ plan: string; income: number }>;
};

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  plan?: string | null;
  isActive?: boolean;
  createdAt?: string;
  counts?: { orders: number };
};

const palette = ["#ed1f2b", "#7c3fe0", "#2f7de1", "#ff7a00", "#70b83b", "#10b981"];

export function AdminOverviewClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [overviewData, restaurantsData] = await Promise.all([
          apiFetch<Overview>("/admin/overview"),
          apiFetch<Restaurant[]>("/admin/restaurants")
        ]);

        if (mounted) {
          setOverview(overviewData);
          setRestaurants(restaurantsData);
          setStatus("ready");
        }
      } catch (error) {
        if (mounted) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "تعذر تحميل لوحة الأدمن.");
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const cards = overview?.cards;
  const newestRestaurants = restaurants.slice(0, 5);
  const topRestaurants = [...restaurants].sort((a, b) => (b.counts?.orders ?? 0) - (a.counts?.orders ?? 0)).slice(0, 5);

  const planChart = useMemo(
    () => toChartData(overview?.planDistribution ?? [], "plan", "لا توجد باقة"),
    [overview?.planDistribution]
  );
  const cityChart = useMemo(
    () => toChartData(overview?.cityDistribution ?? [], "city", "غير محدد"),
    [overview?.cityDistribution]
  );
  const incomeChart = useMemo(() => {
    const incomeByPlan = new Map((overview?.planIncomeDistribution ?? []).map((item) => [item.plan, item.income]));
    const labels = planChart.length > 0 ? planChart.map((item) => item.label) : ["الأساسية", "الاحترافية", "المميزة"];

    return labels.map((label, index) => ({
      label,
      value: incomeByPlan.get(label) ?? 0,
      color: palette[index % palette.length]
    }));
  }, [overview?.planIncomeDistribution, planChart]);

  return (
    <>
      <div className="admin-grid">
        <StatCard label="إجمالي الدخل" value={formatMoney(cards?.totalIncome ?? 0)} note="+8%" icon={Banknote} />
        <StatCard label="عدد المطاعم" value={String(cards?.restaurants ?? 0)} note="+8%" icon={Store} />
        <StatCard label="المطاعم الفعالة" value={String(cards?.activeRestaurants ?? 0)} note="+8%" icon={Store} />
        <StatCard label="تنتهي قريبا" value={String(cards?.expiringSoon ?? 0)} note="خلال 7 أيام" icon={Clock} />
        <StatCard label="طلبات واتساب اليوم" value={String(cards?.whatsappOrders ?? 0)} note="+8%" icon={ShoppingBag} />
      </div>

      {status === "error" ? <EmptyState title="تعذر تحميل البيانات" text={message} /> : null}

      <div className="analytics-grid">
        <DonutChart title="توزيع المطاعم حسب الباقة" center={`${sumValues(planChart)} مطعم`} data={planChart} />
        <BarChart data={incomeChart} />
        <DonutChart title="المطاعم حسب المدينة" center={`${sumValues(cityChart)} مطعم`} data={cityChart} actionLabel="جميع المدن" />
      </div>

      <div className="admin-lower-grid">
        <section className="data-card wide">
          <div className="section-head">
            <h2>أحدث المطاعم المضافة</h2>
            <Link href="/admin/restaurants">عرض الكل</Link>
          </div>
          {status === "loading" ? <LoadingState /> : null}
          {status === "ready" && restaurants.length === 0 ? (
            <EmptyState title="لا توجد مطاعم بعد" text="أضف أول مطعم حتى تظهر الإحصائيات والجداول هنا." />
          ) : null}
          {status === "ready" && restaurants.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>المطعم</th>
                  <th>المدينة</th>
                  <th>الباقة</th>
                  <th>تاريخ الإضافة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {newestRestaurants.map((restaurant) => (
                  <tr key={restaurant.id}>
                    <td>
                      <span className="table-avatar" />
                      <strong>{restaurant.name}</strong>
                    </td>
                    <td>{restaurant.city ?? "-"}</td>
                    <td>
                      <span className="plan-pill">{restaurant.plan ?? "-"}</span>
                    </td>
                    <td>{formatDate(restaurant.createdAt)}</td>
                    <td>
                      <span className={restaurant.isActive ? "status-pill on" : "status-pill off"}>
                        {restaurant.isActive ? "فعال" : "متوقف"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>

        <section className="data-card">
          <div className="section-head">
            <h2>أكثر المطاعم زيارة</h2>
            <Link href="/admin/restaurants">عرض الكل</Link>
          </div>
          {topRestaurants.length > 0 ? (
            <div className="visit-list">
              {topRestaurants.map((restaurant) => (
                <div className="visit-row" key={restaurant.id}>
                  <span className="table-avatar" />
                  <div>
                    <b>{restaurant.name}</b>
                    <small>{restaurant.city ?? "-"}</small>
                  </div>
                  <em>{new Intl.NumberFormat("en-US").format(restaurant.counts?.orders ?? 0)} زيارة</em>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="لا توجد زيارات" text="ستظهر الزيارات بعد نشر المنيو واستقبال العملاء." />
          )}
        </section>
      </div>
    </>
  );
}

function toChartData<T extends NamedDistributionItem>(items: T[], labelKey: "plan" | "city", fallback: string) {
  const data = items.length > 0 ? items : [{ [labelKey]: fallback, count: 0 }] as T[];

  return data.map((item, index) => ({
    label: item[labelKey] ?? fallback,
    value: item.count,
    color: palette[index % palette.length]
  }));
}

function sumValues(data: Array<{ value: number }>) {
  return data.reduce((sum, item) => sum + item.value, 0);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} $`;
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB").format(new Date(value));
}

function LoadingState() {
  return (
    <div className="empty-state">
      <Loader2 className="spin" size={28} />
      <b>يتم تحميل البيانات</b>
    </div>
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
