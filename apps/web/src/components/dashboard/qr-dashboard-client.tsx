"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Download, Loader2, Plus, QrCode, RefreshCcw } from "lucide-react";
import { authHeaders } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5010";

type QrItem = {
  id: string;
  label: string;
  targetUrl: string;
  qrUrl: string;
  svg: string;
  branch?: {
    id: string;
    slug: string;
    name: string;
  } | null;
  createdAt: string;
};

type ApiPayload<T> = {
  data?: T;
};

export function QrDashboardClient() {
  const [items, setItems] = useState<QrItem[]>([]);
  const [label, setLabel] = useState("Special offer");
  const [targetUrl, setTargetUrl] = useState("/m/your-restaurant");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error" | "success">("loading");
  const [message, setMessage] = useState("");
  const scansTotal = useMemo(() => items.length * 12, [items.length]);

  useEffect(() => {
    void loadCodes();
  }, []);

  async function loadCodes() {
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/qr`, {
        headers: authHeaders()
      });

      if (!response.ok) {
        throw new Error("تعذر تحميل رموز QR. تأكد من تشغيل API وأن الباقة تدعم QR_CODES.");
      }

      const payload = (await response.json()) as ApiPayload<QrItem[]> | QrItem[];
      setItems(Array.isArray(payload) ? payload : payload.data ?? []);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل QR.");
    }
  }

  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/qr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ label, targetUrl })
      });

      if (!response.ok) {
        throw new Error("تعذر إنشاء QR جديد.");
      }

      const payload = (await response.json()) as ApiPayload<QrItem> | QrItem;
      const item = unwrapPayload(payload);

      if (item) {
        setItems((current) => [item, ...current]);
      }
      setStatus("success");
      setMessage("تم إنشاء QR جديد.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء QR.");
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setStatus("success");
    setMessage("تم نسخ الرابط.");
  }

  function downloadSvg(item: QrItem) {
    const blob = new Blob([item.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "qr-code"}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="qr-page">
      <section className="builder-top">
        <div>
          <span className="eyebrow">QR Center</span>
          <h1>إدارة رموز QR</h1>
          <p>أنشئ QR للمنيو، الفروع، أو الحملات، مع رابط تتبع يسجل حدث QR_OPENED قبل التحويل.</p>
        </div>
        <div className="builder-actions">
          <button type="button" onClick={loadCodes} disabled={status === "loading"}>
            {status === "loading" ? <Loader2 className="spin" size={20} /> : <RefreshCcw size={20} />}
            تحديث
          </button>
        </div>
      </section>

      {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}

      <section className="qr-summary">
        <article>
          <QrCode size={28} />
          <span>الرموز</span>
          <b>{items.length}</b>
        </article>
        <article>
          <Copy size={28} />
          <span>روابط تتبع</span>
          <b>{items.filter((item) => item.qrUrl).length}</b>
        </article>
        <article>
          <Download size={28} />
          <span>قراءات تجريبية</span>
          <b>{scansTotal}</b>
        </article>
      </section>

      <section className="qr-layout">
        <form className="qr-form" onSubmit={createCode}>
          <h2>QR مخصص</h2>
          <label>
            <span>الاسم</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <label>
            <span>الرابط الهدف</span>
            <input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} />
          </label>
          <button className="primary-action" type="submit" disabled={status === "saving"}>
            {status === "saving" ? <Loader2 className="spin" size={20} /> : <Plus size={20} />}
            إنشاء QR
          </button>
        </form>

        <div className="qr-grid">
          {items.map((item) => (
            <article className="qr-card" key={item.id}>
              <div className="qr-art" dangerouslySetInnerHTML={{ __html: item.svg }} />
              <div className="qr-card-body">
                <h2>{item.label}</h2>
                <p>{item.branch ? item.branch.name : "Main menu"}</p>
                <small>{item.targetUrl}</small>
                <div>
                  <button type="button" onClick={() => copy(item.qrUrl)} title="Copy QR link">
                    <Copy size={18} />
                  </button>
                  <button type="button" onClick={() => copy(item.targetUrl)} title="Copy target link">
                    <QrCode size={18} />
                  </button>
                  <button type="button" onClick={() => downloadSvg(item)} title="Download SVG">
                    <Download size={18} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function unwrapPayload(payload: ApiPayload<QrItem> | QrItem): QrItem | undefined {
  const wrapped = payload as ApiPayload<QrItem>;
  return wrapped.data ?? (payload as QrItem);
}
