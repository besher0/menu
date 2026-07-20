"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";

type Order = {
  id: string;
  branch?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  totalAmount: number;
  currency: string;
  status: string;
  source: string;
  createdAt: string;
  items: Array<{ id: string; name: string; quantity: number; totalPrice: number }>;
};

export function OrdersClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await apiFetch<Order[]>("/dashboard/orders");
        if (mounted) {
          setOrders(data);
          setStatus("ready");
        }
      } catch (error) {
        if (mounted) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "تعذر تحميل الطلبات.");
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
          <span className="eyebrow">Orders</span>
          <h1>طلبات المطعم</h1>
          <p>كل الطلبات القادمة من المنيو العام وواتساب.</p>
        </div>
      </section>
      <section className="data-card full">
        {status === "loading" ? (
          <div className="empty-state">
            <Loader2 className="spin" size={28} />
            <b>يتم تحميل الطلبات</b>
          </div>
        ) : null}
        {status === "error" ? <EmptyState title="تعذر تحميل الطلبات" text={message} /> : null}
        {status === "ready" && orders.length === 0 ? (
          <EmptyState title="لا توجد طلبات" text="ستظهر الطلبات هنا بعد استخدام العملاء للمنيو العام." />
        ) : null}
        {status === "ready" && orders.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>العميل</th>
                <th>الفرع</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>العناصر</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.customerName ?? "-"}</strong>
                    <small>{order.customerPhone ?? ""}</small>
                  </td>
                  <td>{order.branch ?? "-"}</td>
                  <td>
                    {order.totalAmount} {order.currency}
                  </td>
                  <td>
                    <span className="status-pill on">{order.status}</span>
                  </td>
                  <td>{order.items.length}</td>
                  <td>{new Date(order.createdAt).toLocaleDateString("ar")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
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
