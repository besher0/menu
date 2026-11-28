"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Plus, QrCode, RefreshCcw, Trash2 } from "lucide-react";
import { authHeaders } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type Branch = {
  id: string;
  slug: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  whatsappPhone?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
};

type ApiPayload<T> = {
  data?: T;
};

export function BranchesClient() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [editImageId, setEditImageId] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error" | "success">("loading");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const operationLock = useRef(false);
  const busy = uploading !== null || status === "saving" || status === "loading";

  useEffect(() => {
    void loadBranches();
  }, []);

  async function loadBranches() {
    if (operationLock.current) return;
    operationLock.current = true;
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/branches`, {
        headers: authHeaders(),
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("تعذر تحميل الفروع.");
      }

      const payload = (await response.json()) as ApiPayload<Branch[]> | Branch[];
      setBranches(Array.isArray(payload) ? payload : payload.data ?? []);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الفروع.");
    } finally {
      operationLock.current = false;
    }
  }

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true;
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/branches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ name, address, city, whatsappPhone, imageUrl: imageUrl.trim() || null })
      });

      if (!response.ok) {
        throw new Error("تعذر إنشاء الفرع. ربما وصلت إلى حد الباقة MAX_BRANCHES.");
      }

      const payload = (await response.json()) as ApiPayload<Branch> | Branch;
      const branch = unwrapBranch(payload);
      if (!branch?.id) throw new Error("لم يرجع الخادم بيانات الفرع الجديد.");
      setBranches((current) => [branch, ...current]);
      if (imageUrl && branch.imageUrl !== imageUrl) throw new Error("تم إنشاء الفرع ولكن لم يتم حفظ صورته. عدّل الصورة من بطاقة الفرع.");
      setName("");
      setAddress("");
      setCity("");
      setWhatsappPhone("");
      setImageUrl("");
      setStatus("success");
      setMessage("تم إنشاء الفرع.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء الفرع.");
    } finally {
      operationLock.current = false;
    }
  }

  async function saveBranchImage(branch: Branch) {
    if (operationLock.current || editImageId !== branch.id) return;
    const desiredUrl = editImageUrl.trim();
    if (!isImageUrl(desiredUrl)) {
      setStatus("error");
      setMessage("اختر صورة وانتظر اكتمال رفعها أولاً.");
      return;
    }
    operationLock.current = true;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/dashboard/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: branch.name,
          address: branch.address,
          city: branch.city,
          country: branch.country,
          whatsappPhone: branch.whatsappPhone,
          imageUrl: desiredUrl,
          isActive: branch.isActive
        })
      });
      if (!response.ok) throw new Error("تعذر حفظ صورة الفرع.");
      const payload = (await response.json()) as ApiPayload<Branch> | Branch;
      const updated = unwrapBranch(payload);
      if (updated?.id !== branch.id || updated.imageUrl !== desiredUrl) {
        throw new Error("لم يؤكد الخادم حفظ رابط الصورة. حاول الحفظ مرة أخرى.");
      }
      setBranches((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditImageId(null);
      setStatus("success");
      setMessage("تم تحديث صورة الفرع.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر حفظ الصورة.");
    } finally {
      operationLock.current = false;
    }
  }

  async function uploadImage(file: File, altText: string) {
    const body = new FormData();
    body.append("file", file);
    body.append("type", "IMAGE");
    body.append("altText", altText);
    const response = await fetch(`${API_URL}/dashboard/media/upload`, {
      method: "POST",
      headers: authHeaders(),
      body
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.message;
      throw new Error(typeof message === "string" ? message : Array.isArray(message) ? message.join("، ") : "تعذر رفع صورة الفرع.");
    }
    const url = payload?.data?.url ?? payload?.url;
    if (typeof url !== "string" || !isImageUrl(url)) {
      throw new Error("لم يرجع الخادم رابط صورة صالحاً بعد الرفع.");
    }
    return url.trim();
  }

  async function uploadBranchImage(event: ChangeEvent<HTMLInputElement>, branchId: string) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || operationLock.current) return;
    operationLock.current = true;
    setUploading(branchId);
    setEditImageUrl("");
    setStatus("idle");
    setMessage("جاري رفع صورة الفرع...");
    try {
      const url = await uploadImage(file, `صورة فرع ${branchId}`);
      setEditImageId(branchId);
      setEditImageUrl(url);
      setMessage("تم رفع صورة الفرع. اضغط حفظ الصورة لتثبيتها.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع صورة الفرع.");
    } finally {
      input.value = "";
      setUploading(null);
      operationLock.current = false;
    }
  }

  async function uploadNewBranchImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || operationLock.current) return;
    operationLock.current = true;
    setUploading("new");
    setImageUrl("");
    setStatus("idle");
    setMessage("جاري رفع صورة الفرع...");
    try {
      setImageUrl(await uploadImage(file, name || file.name));
      setMessage("تم رفع الصورة. اضغط إضافة فرع لحفظها.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع صورة الفرع.");
    } finally {
      input.value = "";
      setUploading(null);
      operationLock.current = false;
    }
  }

  async function deleteBranch(id: string) {
    if (operationLock.current) return;
    operationLock.current = true;
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/branches/${id}`, {
        method: "DELETE",
        headers: authHeaders()
      });

      if (!response.ok) {
        throw new Error("تعذر حذف الفرع. يجب إبقاء فرع واحد على الأقل.");
      }

      setBranches((current) => current.filter((branch) => branch.id !== id));
      setStatus("success");
      setMessage("تم حذف الفرع.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر حذف الفرع.");
    } finally {
      operationLock.current = false;
    }
  }

  return (
    <div className="branches-page">
      <section className="builder-top">
        <div>
          <span className="eyebrow">Branches</span>
          <h1>إدارة الفروع</h1>
          <p>أضف فروع المطعم، واربط كل فرع برقم واتساب وموقع ورابط QR مستقل.</p>
        </div>
        <div className="builder-actions">
          <button type="button" onClick={loadBranches} disabled={busy}>
            {status === "loading" ? <Loader2 className="spin" size={20} /> : <RefreshCcw size={20} />}
            تحديث
          </button>
        </div>
      </section>

      {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}

      <section className="branches-layout">
        <form className="branch-form" onSubmit={createBranch}>
          <h2>فرع جديد</h2>
          <label>
            <span>اسم الفرع</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            <span>العنوان</span>
            <input value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
          <label>
            <span>المدينة</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label>
            <span>صورة واجهة الفرع</span>
            {imageUrl ? (
              <img src={imageUrl} alt="معاينة صورة الفرع" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 10 }} />
            ) : null}
            <input accept="image/*" type="file" disabled={busy} onChange={(event) => void uploadNewBranchImage(event)} />
            {uploading === "new" ? <span role="status">جاري رفع الصورة...</span> : null}
          </label>
          <label>
            <span>واتساب الفرع</span>
            <input value={whatsappPhone} onChange={(event) => setWhatsappPhone(event.target.value)} />
          </label>
          <button className="primary-action" type="submit" disabled={busy}>
            {status === "saving" ? <Loader2 className="spin" size={20} /> : <Plus size={20} />}
            إضافة فرع
          </button>
        </form>

        <div className="branches-grid">
          {branches.map((branch) => (
            <article className="branch-card" key={branch.id}>
              <header>
                <div>
                  <h2>{branch.name}</h2>
                  <p>{branch.slug}</p>
                </div>
                <span className={branch.isActive ? "availability on" : "availability off"}>
                  {branch.isActive ? "فعال" : "موقوف"}
                </span>
              </header>
              {branch.imageUrl ? (
                <img src={branch.imageUrl} alt={`صورة ${branch.name}`} loading="lazy" style={{ width: "100%", height: 170, objectFit: "cover", borderRadius: 12 }} />
              ) : null}
              <div className="branch-meta">
                <p>
                  <MapPin size={18} />
                  {branch.address || branch.city || "لا يوجد عنوان"}
                </p>
                <p>{branch.whatsappPhone ? `WhatsApp: ${branch.whatsappPhone}` : "لا يوجد واتساب خاص"}</p>
              </div>
              {editImageId === branch.id ? (
                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                  <label>
                    <span>صورة الفرع</span>
                    {editImageUrl ? (
                      <img src={editImageUrl} alt={`معاينة ${branch.name}`} style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 10 }} />
                    ) : null}
                    <input accept="image/*" type="file" disabled={busy} onChange={(event) => void uploadBranchImage(event, branch.id)} />
                    {uploading === branch.id ? <span role="status">جاري رفع الصورة...</span> : null}
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" disabled={busy || !isImageUrl(editImageUrl)} onClick={() => void saveBranchImage(branch)}>حفظ الصورة</button>
                    <button type="button" disabled={busy} onClick={() => setEditImageId(null)}>إلغاء</button>
                  </div>
                </div>
              ) : null}
              <footer>
                <button type="button" disabled={busy} onClick={() => { setEditImageId(branch.id); setEditImageUrl(branch.imageUrl ?? ""); }}>
                  تعديل الصورة
                </button>
                <a href={`/dashboard/qr?branch=${branch.slug}`}>
                  <QrCode size={18} />
                  QR
                </a>
                <button type="button" disabled={busy} onClick={() => deleteBranch(branch.id)}>
                  <Trash2 size={18} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function unwrapBranch(payload: ApiPayload<Branch> | Branch): Branch {
  return (payload as ApiPayload<Branch>).data ?? (payload as Branch);
}

function isImageUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}
