"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, MousePointerClick, ShoppingCart, TrendingUp } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { StatCard } from "@/components/admin/stat-card";

type Analytics = {
  visits: number;
  productViews: number;
  addToCart: number;
  whatsappClicks: number;
  conversionRate: number;
  topProducts: Array<{ productId?: string | null; name: string; quantity: number }>;
};

export function AnalyticsClient() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await apiFetch<Analytics>("/dashboard/analytics");
        if (mounted) {
          setAnalytics(data);
          setStatus("ready");
        }
      } catch (error) {
        if (mounted) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "تعذر تحميل التحليلات.");
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="products-page">
      <section className="products-header">
        <div>
          <span className="eyebrow">Analytics</span>
          <h1>تحليلات المنيو</h1>
          <p>زيارات المنيو، مشاهدات المنتجات، والضغط على واتساب.</p>
        </div>
      </section>

      {status === "loading" ? (
        <div className="empty-state">
          <Loader2 className="spin" size={28} />
          <b>يتم تحميل التحليلات</b>
        </div>
      ) : null}
      {status === "error" ? <EmptyState title="تعذر تحميل التحليلات" text={message} /> : null}
      {status === "ready" && analytics ? (
        <>
          <div className="admin-grid four">
            <StatCard label="الزيارات" value={String(analytics.visits)} note="MENU_VIEWED" icon={BarChart3} />
            <StatCard label="مشاهدات المنتجات" value={String(analytics.productViews)} note="PRODUCT_VIEWED" icon={TrendingUp} />
            <StatCard label="إضافة للسلة" value={String(analytics.addToCart)} note="ADD_TO_CART" icon={ShoppingCart} />
            <StatCard label="ضغط واتساب" value={String(analytics.whatsappClicks)} note={`${analytics.conversionRate}%`} icon={MousePointerClick} />
          </div>

          <section className="data-card full">
            <div className="section-head">
              <h2>أكثر المنتجات طلباً</h2>
            </div>
            {analytics.topProducts.length === 0 ? (
              <EmptyState title="لا توجد بيانات طلبات" text="ستظهر المنتجات الأعلى بعد استقبال الطلبات." />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topProducts.map((product) => (
                    <tr key={`${product.productId ?? product.name}`}>
                      <td>{product.name}</td>
                      <td>{product.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
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
