"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCcw } from "lucide-react";
import { authHeaders, getBrowserSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type MediaPageTab = "ingredients" | "meal-details";

type IngredientLibraryItem = {
  id: string;
  adminName: string;
  displayName: string;
  imageUrl?: string | null;
  isActive: boolean;
};

type MealDetailLibraryItem = {
  id: string;
  adminName: string;
  displayName: string;
  value?: string | null;
  icon: string;
  iconUrl?: string | null;
  isActive: boolean;
};

type IngredientDraft = {
  adminName: string;
  displayName: string;
  imageUrl: string;
};

type MealDetailDraft = {
  adminName: string;
  displayName: string;
  value: string;
  icon: string;
  iconUrl: string;
};

type ApiPayload<T> = {
  data?: T;
};

const defaultIngredientDraft: IngredientDraft = { adminName: "", displayName: "", imageUrl: "" };
const defaultMealDetailDraft: MealDetailDraft = { adminName: "", displayName: "", value: "", icon: "utensils", iconUrl: "" };

export function MediaLibraryClient() {
  const [activeTab, setActiveTab] = useState<MediaPageTab>("ingredients");
  const [ingredients, setIngredients] = useState<IngredientLibraryItem[]>([]);
  const [mealDetails, setMealDetails] = useState<MealDetailLibraryItem[]>([]);
  const [ingredientDraft, setIngredientDraft] = useState<IngredientDraft>(defaultIngredientDraft);
  const [mealDetailDraft, setMealDetailDraft] = useState<MealDetailDraft>(defaultMealDetailDraft);
  const [ingredientImageFile, setIngredientImageFile] = useState<File | null>(null);
  const [mealDetailIconFile, setMealDetailIconFile] = useState<File | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(() => getBrowserSession()?.user.role === "SUPER_ADMIN");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error" | "success">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setIsSuperAdmin(getBrowserSession()?.user.role === "SUPER_ADMIN");
  }, []);

  function libraryPath(kind: "ingredients" | "meal-details") {
    return isSuperAdmin ? `/admin/library/${kind}` : `/dashboard/media/${kind}`;
  }

  useEffect(() => {
    if (activeTab === "ingredients") {
      void loadIngredients();
    }
    if (activeTab === "meal-details") {
      void loadMealDetails();
    }
  }, [activeTab, isSuperAdmin]);

  async function loadIngredients() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(`${API_URL}${libraryPath("ingredients")}`, {
        headers: authHeaders(),
        cache: "no-store"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiErrorMessage(payload, "تعذر تحميل مكتبة المكونات."));
      setIngredients(unwrapList<IngredientLibraryItem>(payload));
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل مكتبة المكونات.");
    }
  }

  async function saveIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSuperAdmin) return;
    setStatus("saving");
    setMessage("");

    try {
      const imageUrl = ingredientImageFile
        ? await uploadLibraryFile(ingredientImageFile, "IMAGE", ingredientDraft.displayName || ingredientDraft.adminName || ingredientImageFile.name)
        : ingredientDraft.imageUrl || undefined;
      const response = await fetch(`${API_URL}${libraryPath("ingredients")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          adminName: ingredientDraft.adminName,
          displayName: ingredientDraft.displayName,
          imageUrl
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiErrorMessage(payload, "تعذر حفظ المكون."));
      setIngredientDraft(defaultIngredientDraft);
      setIngredientImageFile(null);
      setIngredients((current) => [unwrapData<IngredientLibraryItem>(payload), ...current]);
      setStatus("success");
      setMessage("تم حفظ المكون في المكتبة.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر حفظ المكون.");
    }
  }

  async function updateIngredient(item: IngredientLibraryItem, patch: Partial<IngredientLibraryItem>) {
    if (!isSuperAdmin) return;
    const response = await fetch(`${API_URL}${libraryPath("ingredients")}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ...item, ...patch })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(readApiErrorMessage(payload, "تعذر تعديل المكون."));
      return;
    }
    const updated = unwrapData<IngredientLibraryItem>(payload);
    setIngredients((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
  }

  async function uploadIngredientImage(item: IngredientLibraryItem, file: File | null) {
    if (!isSuperAdmin) return;
    if (!file) return;
    setStatus("saving");
    setMessage("");

    try {
      const imageUrl = await uploadLibraryFile(file, "IMAGE", item.displayName || item.adminName || file.name);
      await updateIngredient(item, { imageUrl });
      setStatus("success");
      setMessage("تم تحديث صورة المكون.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع صورة المكون.");
    }
  }

  async function deleteIngredient(item: IngredientLibraryItem) {
    if (!isSuperAdmin) return;
    const response = await fetch(`${API_URL}${libraryPath("ingredients")}/${item.id}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(readApiErrorMessage(payload, "تعذر حذف المكون."));
      return;
    }
    setIngredients((current) => current.map((entry) => entry.id === item.id ? { ...entry, isActive: false } : entry));
  }

  async function loadMealDetails() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(`${API_URL}${libraryPath("meal-details")}`, {
        headers: authHeaders(),
        cache: "no-store"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiErrorMessage(payload, "تعذر تحميل تفاصيل الوجبة."));
      setMealDetails(unwrapList<MealDetailLibraryItem>(payload));
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل تفاصيل الوجبة.");
    }
  }

  async function saveMealDetail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSuperAdmin) return;
    setStatus("saving");
    setMessage("");

    try {
      const iconUrl = mealDetailIconFile
        ? await uploadLibraryFile(mealDetailIconFile, "IMAGE", mealDetailDraft.displayName || mealDetailDraft.adminName || mealDetailIconFile.name)
        : mealDetailDraft.iconUrl || undefined;
      const response = await fetch(`${API_URL}${libraryPath("meal-details")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          adminName: mealDetailDraft.adminName,
          displayName: mealDetailDraft.displayName,
          value: mealDetailDraft.value || undefined,
          icon: mealDetailDraft.icon || "utensils",
          iconUrl
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiErrorMessage(payload, "تعذر حفظ التفصيل."));
      setMealDetailDraft(defaultMealDetailDraft);
      setMealDetailIconFile(null);
      setMealDetails((current) => [unwrapData<MealDetailLibraryItem>(payload), ...current]);
      setStatus("success");
      setMessage("تم حفظ التفصيل في المكتبة.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر حفظ التفصيل.");
    }
  }

  async function updateMealDetail(item: MealDetailLibraryItem, patch: Partial<MealDetailLibraryItem>) {
    if (!isSuperAdmin) return;
    const response = await fetch(`${API_URL}${libraryPath("meal-details")}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ...item, ...patch })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(readApiErrorMessage(payload, "تعذر تعديل التفصيل."));
      return;
    }
    const updated = unwrapData<MealDetailLibraryItem>(payload);
    setMealDetails((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
  }

  async function uploadMealDetailIcon(item: MealDetailLibraryItem, file: File | null) {
    if (!isSuperAdmin) return;
    if (!file) return;
    setStatus("saving");
    setMessage("");

    try {
      const iconUrl = await uploadLibraryFile(file, "IMAGE", item.displayName || item.adminName || file.name);
      await updateMealDetail(item, { iconUrl });
      setStatus("success");
      setMessage("تم تحديث صورة التفصيل.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع صورة التفصيل.");
    }
  }

  async function deleteMealDetail(item: MealDetailLibraryItem) {
    if (!isSuperAdmin) return;
    const response = await fetch(`${API_URL}${libraryPath("meal-details")}/${item.id}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(readApiErrorMessage(payload, "تعذر حذف التفصيل."));
      return;
    }
    setMealDetails((current) => current.map((entry) => entry.id === item.id ? { ...entry, isActive: false } : entry));
  }

  return (
    <div className="media-page">
      <section className="builder-top">
        <div>
          <span className="eyebrow">Library</span>
          <h1>المكتبة</h1>
          <p>أدر المكونات وتفاصيل الوجبة من مكان واحد.</p>
        </div>
        <div className="builder-actions">
          <button
            type="button"
            onClick={() => activeTab === "ingredients" ? void loadIngredients() : void loadMealDetails()}
            disabled={status === "loading"}
          >
            {status === "loading" ? <Loader2 className="spin" size={20} /> : <RefreshCcw size={20} />}
            تحديث
          </button>
        </div>
      </section>

      {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}

      <div className="media-page-tabs">
        <button type="button" className={activeTab === "ingredients" ? "active" : ""} onClick={() => setActiveTab("ingredients")}>المكونات</button>
        <button type="button" className={activeTab === "meal-details" ? "active" : ""} onClick={() => setActiveTab("meal-details")}>تفاصيل الوجبة</button>
      </div>

      {activeTab === "ingredients" ? (
        <IngredientLibraryPanel
          canManage={isSuperAdmin}
          draft={ingredientDraft}
          items={ingredients}
          saving={status === "saving"}
          onDraftChange={setIngredientDraft}
          onFileChange={setIngredientImageFile}
          onSubmit={saveIngredient}
          onUpdate={(item, patch) => void updateIngredient(item, patch)}
          onUploadImage={(item, file) => void uploadIngredientImage(item, file)}
          onDelete={(item) => void deleteIngredient(item)}
          selectedFileName={ingredientImageFile?.name}
        />
      ) : (
        <MealDetailLibraryPanel
          canManage={isSuperAdmin}
          draft={mealDetailDraft}
          items={mealDetails}
          saving={status === "saving"}
          onDraftChange={setMealDetailDraft}
          onFileChange={setMealDetailIconFile}
          onSubmit={saveMealDetail}
          onUpdate={(item, patch) => void updateMealDetail(item, patch)}
          onUploadIcon={(item, file) => void uploadMealDetailIcon(item, file)}
          onDelete={(item) => void deleteMealDetail(item)}
          selectedFileName={mealDetailIconFile?.name}
        />
      )}
    </div>
  );
}

function IngredientLibraryPanel({
  canManage,
  draft,
  items,
  saving,
  onDraftChange,
  onFileChange,
  onSubmit,
  onUpdate,
  onUploadImage,
  onDelete,
  selectedFileName
}: {
  canManage: boolean;
  draft: IngredientDraft;
  items: IngredientLibraryItem[];
  saving: boolean;
  onDraftChange: (draft: IngredientDraft) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (item: IngredientLibraryItem, patch: Partial<IngredientLibraryItem>) => void;
  onUploadImage: (item: IngredientLibraryItem, file: File | null) => void;
  onDelete: (item: IngredientLibraryItem) => void;
  selectedFileName?: string;
}) {
  if (!canManage) {
    return (
      <section className="library-panel">
        <div className="library-table-wrap">
          <table className="restaurant-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Admin name</th>
                <th>Display name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? items.map((item) => (
                <tr key={item.id}>
                  <td>{item.imageUrl ? <img className="library-thumb" src={item.imageUrl} alt="" /> : "-"}</td>
                  <td>{item.adminName}</td>
                  <td>{item.displayName}</td>
                  <td><StatusPill active={item.isActive} /></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4}><div className="library-empty">No library items yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="library-panel">
      <form className="media-form library-form" onSubmit={onSubmit}>
        <h2>مكتبة المكونات</h2>
        <label>
          <span>اسم الإدارة</span>
          <input value={draft.adminName} onChange={(event) => onDraftChange({ ...draft, adminName: event.target.value })} required />
        </label>
        <label>
          <span>الاسم الظاهر للزبون</span>
          <input value={draft.displayName} onChange={(event) => onDraftChange({ ...draft, displayName: event.target.value })} required />
        </label>
        <label>
          <span>صورة المكون</span>
          <input accept="image/*" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} type="file" />
          {selectedFileName ? <small className="library-file-name">{selectedFileName}</small> : null}
        </label>
        <button className="primary-action" type="submit" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
          إضافة
        </button>
      </form>

      <div className="library-table-wrap">
        <table className="restaurant-table">
          <thead>
            <tr>
              <th>الصورة</th>
              <th>اسم الإدارة</th>
              <th>يظهر للزبون</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((item) => (
              <tr key={item.id}>
                <td>{item.imageUrl ? <img className="library-thumb" src={item.imageUrl} alt="" /> : "-"}</td>
                <td><input value={item.adminName} onChange={(event) => onUpdate(item, { adminName: event.target.value })} /></td>
                <td><input value={item.displayName} onChange={(event) => onUpdate(item, { displayName: event.target.value })} /></td>
                <td><button className="bare" type="button" onClick={() => onUpdate(item, { isActive: !item.isActive })}><StatusPill active={item.isActive} /></button></td>
                <td>
                  <label className="library-upload-action">
                    <input accept="image/*" disabled={saving} type="file" onChange={(event) => handleRowFile(event, (file) => onUploadImage(item, file))} />
                    رفع صورة
                  </label>
                  <button className="danger-link" type="button" onClick={() => onDelete(item)}>حذف</button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5}><div className="library-empty">لا توجد مكونات محفوظة بعد.</div></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MealDetailLibraryPanel({
  canManage,
  draft,
  items,
  saving,
  onDraftChange,
  onFileChange,
  onSubmit,
  onUpdate,
  onUploadIcon,
  onDelete,
  selectedFileName
}: {
  canManage: boolean;
  draft: MealDetailDraft;
  items: MealDetailLibraryItem[];
  saving: boolean;
  onDraftChange: (draft: MealDetailDraft) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (item: MealDetailLibraryItem, patch: Partial<MealDetailLibraryItem>) => void;
  onUploadIcon: (item: MealDetailLibraryItem, file: File | null) => void;
  onDelete: (item: MealDetailLibraryItem) => void;
  selectedFileName?: string;
}) {
  if (!canManage) {
    return (
      <section className="library-panel">
        <div className="library-table-wrap">
          <table className="restaurant-table">
            <thead>
              <tr>
                <th>Admin name</th>
                <th>Display name</th>
                <th>Value</th>
                <th>Icon</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? items.map((item) => (
                <tr key={item.id}>
                  <td>{item.adminName}</td>
                  <td>{item.displayName}</td>
                  <td>{item.value || "-"}</td>
                  <td>{item.iconUrl ? <img className="library-thumb" src={item.iconUrl} alt="" /> : item.icon}</td>
                  <td><StatusPill active={item.isActive} /></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5}><div className="library-empty">No library items yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="library-panel">
      <form className="media-form library-form" onSubmit={onSubmit}>
        <h2>تفاصيل الوجبة</h2>
        <label>
          <span>اسم الإدارة</span>
          <input value={draft.adminName} onChange={(event) => onDraftChange({ ...draft, adminName: event.target.value })} required />
        </label>
        <label>
          <span>الاسم الظاهر للزبون</span>
          <input value={draft.displayName} onChange={(event) => onDraftChange({ ...draft, displayName: event.target.value })} required />
        </label>
        <label>
          <span>القيمة</span>
          <input value={draft.value} onChange={(event) => onDraftChange({ ...draft, value: event.target.value })} />
        </label>
        <label>
          <span>الأيقونة</span>
          <input value={draft.icon} onChange={(event) => onDraftChange({ ...draft, icon: event.target.value })} />
        </label>
        <label>
          <span>صورة التفصيل</span>
          <input accept="image/*" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} type="file" />
          {selectedFileName ? <small className="library-file-name">{selectedFileName}</small> : null}
        </label>
        <button className="primary-action" type="submit" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
          إضافة
        </button>
      </form>

      <div className="library-table-wrap">
        <table className="restaurant-table">
          <thead>
            <tr>
              <th>اسم الإدارة</th>
              <th>يظهر للزبون</th>
              <th>القيمة</th>
              <th>الأيقونة</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((item) => (
              <tr key={item.id}>
                <td><input value={item.adminName} onChange={(event) => onUpdate(item, { adminName: event.target.value })} /></td>
                <td><input value={item.displayName} onChange={(event) => onUpdate(item, { displayName: event.target.value })} /></td>
                <td><input value={item.value ?? ""} onChange={(event) => onUpdate(item, { value: event.target.value })} /></td>
                <td>{item.iconUrl ? <img className="library-thumb" src={item.iconUrl} alt="" /> : <input value={item.icon} onChange={(event) => onUpdate(item, { icon: event.target.value })} />}</td>
                <td><button className="bare" type="button" onClick={() => onUpdate(item, { isActive: !item.isActive })}><StatusPill active={item.isActive} /></button></td>
                <td>
                  <label className="library-upload-action">
                    <input accept="image/*" disabled={saving} type="file" onChange={(event) => handleRowFile(event, (file) => onUploadIcon(item, file))} />
                    رفع صورة
                  </label>
                  <button className="danger-link" type="button" onClick={() => onDelete(item)}>حذف</button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6}><div className="library-empty">لا توجد تفاصيل وجبة محفوظة بعد.</div></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function unwrapData<T>(payload: unknown): T {
  const record = payload && typeof payload === "object" ? payload as { data?: T } : {};
  return (record.data ?? payload) as T;
}

function unwrapList<T>(payload: unknown): T[] {
  const data = unwrapData<T[] | { data?: T[] }>(payload);
  if (Array.isArray(data)) return data;
  return data?.data ?? [];
}

async function uploadLibraryFile(file: File, type: "IMAGE" | "PNG_ICON", altText: string) {
  const body = new FormData();
  body.append("file", file);
  body.append("type", type);
  body.append("altText", altText || file.name);

  const response = await fetch(`${API_URL}/dashboard/media/upload`, {
    method: "POST",
    headers: authHeaders(),
    body
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload, "تعذر رفع الصورة."));
  }

  const url = payload?.data?.url ?? payload?.url;
  if (typeof url !== "string" || !url) {
    throw new Error("تم الرفع بدون رابط صالح للصورة.");
  }

  return url;
}

function handleRowFile(event: ChangeEvent<HTMLInputElement>, onFile: (file: File | null) => void) {
  onFile(event.target.files?.[0] ?? null);
  event.target.value = "";
}

function readApiErrorMessage(payload: unknown, fallback: string) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
  const message = record.message ?? record.error ?? data.message;

  if (Array.isArray(message)) return message.join(" | ");
  if (typeof message === "string" && message.trim()) return message;
  return fallback;
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={`status-pill ${active ? "active" : "inactive"}`}>{active ? "فعال" : "متوقف"}</span>;
}
