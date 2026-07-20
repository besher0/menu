"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Copy, Globe2, Loader2, Plus, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import { authHeaders } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type DomainStatus = "PENDING" | "DNS_VERIFIED" | "SSL_PENDING" | "SSL_ACTIVE" | "ACTIVE" | "VERIFIED" | "FAILED" | "DISABLED";

type CustomDomain = {
  id: string;
  domain: string;
  status: DomainStatus;
  verificationToken: string;
  dnsRecords?: {
    txt?: { host: string; value: string };
    cname?: { host: string; value: string };
  } | null;
  verifiedAt?: string | null;
  dnsVerifiedAt?: string | null;
  sslStatus?: string | null;
  activatedAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
};

type ApiPayload<T> = {
  data?: T;
};

export function DomainsClient() {
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error" | "success">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadDomains();
  }, []);

  async function loadDomains() {
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/domains`, {
        headers: authHeaders()
      });

      if (!response.ok) {
        throw new Error("تعذر تحميل الدومينات. تحتاج الباقة إلى ميزة CUSTOM_DOMAIN.");
      }

      const payload = (await response.json()) as ApiPayload<CustomDomain[]> | CustomDomain[];
      setDomains(Array.isArray(payload) ? payload : payload.data ?? []);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الدومينات.");
    }
  }

  async function createDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ domain })
      });

      if (!response.ok) {
        throw new Error("تعذر إضافة الدومين. تأكد من الصيغة وأنه غير مستخدم سابقاً.");
      }

      const payload = (await response.json()) as ApiPayload<CustomDomain> | CustomDomain;
      const item = unwrapDomain(payload);
      setDomains((current) => [item, ...current]);
      setDomain("");
      setStatus("success");
      setMessage("تمت إضافة الدومين. أضف سجلات DNS ثم اضغط تحقق.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر إضافة الدومين.");
    }
  }

  async function verifyDomain(id: string) {
    await mutateDomain(id, "verify", "تم فحص DNS وتحديث حالة الدومين.");
  }

  async function disableDomain(id: string) {
    await mutateDomain(id, "disable", "تم تعطيل الدومين.");
  }

  async function mutateDomain(id: string, action: "verify" | "disable", successMessage: string) {
    setStatus("saving");
    setMessage("");

    try {
      const method = action === "verify" ? "POST" : "DELETE";
      const path = action === "verify" ? `${id}/verify` : id;
      const response = await fetch(`${API_URL}/dashboard/domains/${path}`, {
        method,
        headers: authHeaders()
      });

      if (!response.ok) {
        throw new Error("تعذر تحديث حالة الدومين.");
      }

      const payload = (await response.json()) as ApiPayload<CustomDomain> | CustomDomain;
      const item = unwrapDomain(payload);
      setDomains((current) => current.map((candidate) => (candidate.id === id ? item : candidate)));
      setStatus("success");
      setMessage(successMessage);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحديث حالة الدومين.");
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setStatus("success");
    setMessage("تم النسخ.");
  }

  return (
    <div className="domains-page">
      <section className="builder-top">
        <div>
          <span className="eyebrow">Domains</span>
          <h1>الدومينات و White Label</h1>
          <p>اربط دومين مخصص للمطعم، تحقق من DNS، ثم اجعل المنيو تعمل من نفس تطبيق المنصة حسب Host header.</p>
        </div>
        <div className="builder-actions">
          <button type="button" onClick={loadDomains} disabled={status === "loading"}>
            {status === "loading" ? <Loader2 className="spin" size={20} /> : <RefreshCcw size={20} />}
            تحديث
          </button>
        </div>
      </section>

      {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}

      <section className="domains-layout">
        <form className="domain-form" onSubmit={createDomain}>
          <h2>دومين جديد</h2>
          <label>
            <span>الدومين</span>
            <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="menu.restaurant.com" required />
          </label>
          <button className="primary-action" type="submit" disabled={status === "saving"}>
            {status === "saving" ? <Loader2 className="spin" size={20} /> : <Plus size={20} />}
            إضافة دومين
          </button>
          <div className="domain-note">
            <ShieldCheck size={20} />
            <p>التدفق الحالي يحفظ سجلات DNS ويفعل الدومين بعد تحقق TXT. إصدار الإنتاج يحتاج ربط Caddy أو مزود SSL فعلي.</p>
          </div>
        </form>

        <div className="domains-grid">
          {domains.map((item) => (
            <article className="domain-card" key={item.id}>
              <header>
                <Globe2 size={26} />
                <div>
                  <h2>{item.domain}</h2>
                  <span className={`domain-status ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
                </div>
              </header>
              <section>
                <b>TXT record</b>
                <code>{item.dnsRecords?.txt?.value ?? item.verificationToken}</code>
                <button type="button" onClick={() => copy(item.dnsRecords?.txt?.value ?? item.verificationToken)}>
                  <Copy size={18} />
                  نسخ
                </button>
              </section>
              <section>
                <b>CNAME / Target</b>
                <code>{item.dnsRecords?.cname?.value ?? "yourplatform.com"}</code>
                <button type="button" onClick={() => copy(item.dnsRecords?.cname?.value ?? "yourplatform.com")}>
                  <Copy size={18} />
                  نسخ
                </button>
              </section>
              {item.failureReason ? <p className="domain-error">{item.failureReason}</p> : null}
              <footer>
                <button type="button" onClick={() => verifyDomain(item.id)}>
                  <CheckCircle2 size={18} />
                  تحقق
                </button>
                <button type="button" className="danger" onClick={() => disableDomain(item.id)}>
                  <XCircle size={18} />
                  تعطيل
                </button>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function unwrapDomain(payload: ApiPayload<CustomDomain> | CustomDomain): CustomDomain {
  return (payload as ApiPayload<CustomDomain>).data ?? (payload as CustomDomain);
}

function statusLabel(status: DomainStatus) {
  const labels: Record<DomainStatus, string> = {
    PENDING: "بانتظار DNS",
    DNS_VERIFIED: "DNS مؤكد",
    SSL_PENDING: "SSL قيد التجهيز",
    SSL_ACTIVE: "SSL فعال",
    ACTIVE: "فعال",
    VERIFIED: "مؤكد",
    FAILED: "فشل",
    DISABLED: "معطل"
  };

  return labels[status];
}
