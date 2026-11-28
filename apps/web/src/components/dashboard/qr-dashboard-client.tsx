"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Download, Loader2, Pencil, Plus, QrCode, RefreshCcw, Save, X } from "lucide-react";
import { preferredRestaurantUrl } from "@/lib/public-routes";
import { authHeaders, resolveStoredRestaurant } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type QrItem = {
  id: string;
  label: string;
  targetUrl: string;
  qrUrl: string;
  svg: string;
  scanCount?: number;
  branch?: {
    id: string;
    slug: string;
    name: string;
  } | null;
  createdAt: string;
};

type BranchItem = { id: string; name: string; slug: string; isActive: boolean };

type ApiPayload<T> = {
  data?: T;
};

export function QrDashboardClient() {
  const [items, setItems] = useState<QrItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [newBranchId, setNewBranchId] = useState("");
  const [label, setLabel] = useState("Special offer");
  const [targetUrl, setTargetUrl] = useState(preferredRestaurantUrl("your-restaurant"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTargetUrl, setEditTargetUrl] = useState("");
  const [editSavingId, setEditSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error" | "success">("loading");
  const [message, setMessage] = useState("");
  const scansTotal = useMemo(() => items.reduce((sum, item) => sum + (item.scanCount ?? 0), 0), [items]);

  useEffect(() => {
    const restaurantSlug = resolveStoredRestaurant()?.slug;
    if (restaurantSlug) {
      setTargetUrl(preferredRestaurantUrl(restaurantSlug));
    }

    void loadCodes();
  }, []);

  async function loadCodes() {
    setStatus("loading");
    setMessage("");

    try {
      const [response, branchResponse] = await Promise.all([
        fetch(`${API_URL}/dashboard/qr`, { headers: authHeaders() }),
        fetch(`${API_URL}/dashboard/branches`, { headers: authHeaders() })
      ]);

      if (!response.ok) {
        throw new Error("تعذر تحميل رموز QR. تأكد من تشغيل API وأن الباقة تدعم QR_CODES.");
      }

      const payload = (await response.json()) as ApiPayload<QrItem[]> | QrItem[];
      setItems(Array.isArray(payload) ? payload : payload.data ?? []);
      if (branchResponse.ok) {
        const branchPayload = (await branchResponse.json()) as ApiPayload<BranchItem[]> | BranchItem[];
        const active = (Array.isArray(branchPayload) ? branchPayload : branchPayload.data ?? [])
          .filter((item) => item.isActive);
        setBranches(active);
        setNewBranchId((previous) => active.some((item) => item.id === previous) ? previous : active[0]?.id ?? "");
      }
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

  async function createNewSystemQr(kind: "selector" | "branch") {
    if (status === "saving" || (kind === "branch" && !newBranchId)) return;
    setStatus("saving");
    setMessage("");
    try {
      const endpoint = kind === "selector"
        ? "branch-selector"
        : `branch-entry/${encodeURIComponent(newBranchId)}`;
      const response = await fetch(`${API_URL}/dashboard/qr/${endpoint}`, {
        method: "POST",
        headers: authHeaders()
      });
      if (!response.ok) {
        throw new Error("تعذر إنشاء QR الجديد. تأكد من تفعيل الميزة وصلاحياتك.");
      }
      const payload = (await response.json()) as ApiPayload<QrItem> | QrItem;
      const item = unwrapPayload(payload);
      if (item) {
        setItems((current) => current.some((existing) => existing.id === item.id)
          ? current.map((existing) => existing.id === item.id ? { ...item, scanCount: existing.scanCount } : existing)
          : [item, ...current]);
      }
      setStatus("success");
      setMessage(kind === "selector"
        ? "QR اختيار الفروع جاهز، ويمكنك تنزيله بدون التأثير على الرموز القديمة."
        : "QR الفرع الجديد جاهز، والرموز القديمة لم تتغيّر.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء QR.");
    }
  }

  function startEdit(item: QrItem) {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditTargetUrl(item.targetUrl);
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditTargetUrl("");
    setEditSavingId(null);
  }

  async function updateCode(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setEditSavingId(id);
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/qr/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ label: editLabel, targetUrl: editTargetUrl })
      });

      if (!response.ok) {
        throw new Error("تعذر حفظ تعديل QR.");
      }

      const payload = (await response.json()) as ApiPayload<QrItem> | QrItem;
      const item = unwrapPayload(payload);

      if (item) {
        setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? { ...item, scanCount: currentItem.scanCount } : currentItem)));
      }

      setStatus("success");
      setMessage("تم تحديث الرابط الهدف وبقي رمز QR نفسه.");
      cancelEdit();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تعديل QR.");
      setEditSavingId(null);
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
          <span>إجمالي المسحات الفعلية</span>
          <b>{scansTotal}</b>
        </article>
      </section>

      <section className="os-qr-new-tools" dir="rtl">
        <div className="os-qr-new-tools-copy">
          <h2>نظام QR الجديد للفروع</h2>
          <p>إنشاء رموز جديدة فقط. جميع الرموز المطبوعة سابقاً وروابطها محفوظة بدون أي تغيير.</p>
        </div>
        <div className="os-qr-new-tools-actions">
          <button type="button" className="primary-action" disabled={status === "saving"}
            onClick={() => void createNewSystemQr("selector")}>
            <QrCode size={18} /> QR رئيسي لاختيار الفروع
          </button>
          <div className="os-qr-new-branch">
            <select aria-label="اختر الفرع لإنشاء QR جديد"
              value={newBranchId} onChange={(event) => setNewBranchId(event.target.value)}>
              {branches.length === 0 ? <option value="">لا توجد فروع متاحة</option> : null}
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <button type="button" className="secondary-action"
              disabled={!newBranchId || status === "saving"}
              onClick={() => void createNewSystemQr("branch")}>
              <Plus size={18} /> QR للفرع
            </button>
          </div>
        </div>
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
          {items.map((item) => {
            const isEditing = editingId === item.id;
            const isSavingEdit = editSavingId === item.id;

            return (
              <article className="qr-card" key={item.id}>
                <div className="qr-art" dangerouslySetInnerHTML={{ __html: item.svg }} />
                <div className="qr-card-body">
                  {isEditing ? (
                    <form className="qr-edit-form" onSubmit={(event) => updateCode(event, item.id)}>
                      <p className="qr-edit-note">
                        يمكنك تغيير الرابط الهدف في أي وقت. رمز QR المطبوع سيبقى نفسه ولن تحتاج إلى طباعته من جديد.
                      </p>
                      <label>
                        <span>الاسم</span>
                        <input value={editLabel} onChange={(event) => setEditLabel(event.target.value)} />
                      </label>
                      <label>
                        <span>الرابط الهدف</span>
                        <input value={editTargetUrl} onChange={(event) => setEditTargetUrl(event.target.value)} />
                      </label>
                      <div className="qr-edit-actions">
                        <button type="submit" className="primary-action" disabled={isSavingEdit}>
                          {isSavingEdit ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                          حفظ
                        </button>
                        <button type="button" className="secondary-action" onClick={cancelEdit} disabled={isSavingEdit}>
                          <X size={18} />
                          إلغاء
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
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
                        <button type="button" onClick={() => startEdit(item)} title="Edit QR target">
                          <Pencil size={18} />
                        </button>
                        <button type="button" onClick={() => downloadSvg(item)} title="Download SVG">
                          <Download size={18} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function unwrapPayload(payload: ApiPayload<QrItem> | QrItem): QrItem | undefined {
  const wrapped = payload as ApiPayload<QrItem>;
  return wrapped.data ?? (payload as QrItem);
}
