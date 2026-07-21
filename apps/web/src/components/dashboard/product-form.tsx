"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImagePlus, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { authHeaders, getBrowserSession, getStoredRestaurant, setStoredRestaurant } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5010";

type FormState = {
  name: string;
  categoryId: string;
  description: string;
  basePrice: string;
  currency: string;
  imageUrl: string;
  moodKey: string;
  ingredients: string;
  weight: string;
  protein: string;
  breadType: string;
  spice: string;
  model3dUrl: string;
  model3dFormat: string;
  vrUrl: string;
  isNew: boolean;
  isPopular: boolean;
};

type RestaurantOption = {
  id: string;
  name: string;
  slug: string;
};

type CategoryOption = {
  id: string;
  name: string;
  slug?: string;
};

type MoodOption = {
  key: string;
  label: string;
};

type ProductDetails = {
  id: string;
  name: string;
  description?: string | null;
  basePrice: number;
  currency: string;
  isNew?: boolean;
  isFeatured?: boolean;
  isPopular?: boolean;
  moodKey?: string | null;
  ingredients?: string[];
  nutrition?: {
    weight?: string;
    protein?: string;
    breadType?: string;
    spice?: string;
  } | null;
  media?: {
    model3dUrl?: string | null;
    model3dFormat?: string | null;
    vrUrl?: string | null;
  };
  category?: { id: string; name: string } | null;
  images?: Array<{ url: string }>;
};

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [modelUploadStatus, setModelUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [selectedRestaurantName, setSelectedRestaurantName] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [moodOptions, setMoodOptions] = useState<MoodOption[]>([]);
  const [form, setForm] = useState<FormState>({
    name: "",
    categoryId: "",
    description: "",
    basePrice: "",
    currency: "ل.س",
    imageUrl: "",
    moodKey: "",
    ingredients: "",
    weight: "",
    protein: "",
    breadType: "",
    spice: "",
    model3dUrl: "",
    model3dFormat: "GLB",
    vrUrl: "",
    isNew: false,
    isPopular: false
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function inferModelFormat(filename: string) {
    const extension = filename.split("?")[0].split(".").pop()?.toUpperCase();
    return extension && ["GLB", "GLTF", "USDZ"].includes(extension) ? extension : "GLB";
  }

  function selectedRestaurantHeaders() {
    return authHeaders();
  }

  useEffect(() => {
    const session = getBrowserSession();
    const membershipRestaurants =
      session?.memberships.map((membership) => membership.restaurant) ?? [];
    const queryRestaurantId = new URLSearchParams(window.location.search).get("restaurantId");
    const queryRestaurantSlug = new URLSearchParams(window.location.search).get("restaurantSlug");
    const queryRestaurantName = new URLSearchParams(window.location.search).get("restaurantName") ?? undefined;
    const storedRestaurant = getStoredRestaurant();

    if (queryRestaurantId && queryRestaurantSlug) {
      setStoredRestaurant({ id: queryRestaurantId, slug: queryRestaurantSlug, name: queryRestaurantName });
      setSelectedRestaurantId(queryRestaurantId);
      setSelectedRestaurantName(queryRestaurantName ?? queryRestaurantSlug);
      return;
    }

    if (storedRestaurant?.id) {
      setSelectedRestaurantId(storedRestaurant.id);
      setSelectedRestaurantName(storedRestaurant.name ?? storedRestaurant.slug ?? storedRestaurant.id);
      return;
    }

    async function loadRestaurants() {
      if (session?.user.role !== "SUPER_ADMIN") {
        setRestaurants(membershipRestaurants);
        setSelectedRestaurantId(membershipRestaurants[0]?.id ?? "");
        setSelectedRestaurantName(membershipRestaurants[0]?.name ?? "");
        if (membershipRestaurants[0]) setStoredRestaurant(membershipRestaurants[0]);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/admin/restaurants`, {
          headers: authHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);
        const adminRestaurants = (payload?.data ?? payload ?? []) as RestaurantOption[];
        const nextRestaurants = adminRestaurants.length ? adminRestaurants : membershipRestaurants;
        setRestaurants(nextRestaurants);
        setSelectedRestaurantId(nextRestaurants[0]?.id ?? "");
        setSelectedRestaurantName(nextRestaurants[0]?.name ?? "");
        if (nextRestaurants[0]) setStoredRestaurant(nextRestaurants[0]);
      } catch {
        setRestaurants(membershipRestaurants);
        setSelectedRestaurantId(membershipRestaurants[0]?.id ?? "");
        setSelectedRestaurantName(membershipRestaurants[0]?.name ?? "");
        if (membershipRestaurants[0]) setStoredRestaurant(membershipRestaurants[0]);
      }
    }

    void loadRestaurants();
  }, []);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setCategories([]);
      return;
    }

    async function loadCategories() {
      try {
        const response = await fetch(`${API_URL}/dashboard/categories`, {
          headers: selectedRestaurantHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);
        const body = payload?.data ?? [];
        const nextCategories = (Array.isArray(body) ? body : body.data ?? []) as CategoryOption[];
        setCategories(nextCategories.filter((category) => category.slug !== "all"));
      } catch {
        setCategories([]);
      }
    }

    void loadCategories();
  }, [selectedRestaurantId, restaurants]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setMoodOptions([]);
      return;
    }

    async function loadMoodOptions() {
      try {
        const response = await fetch(`${API_URL}/dashboard/builder`, {
          headers: selectedRestaurantHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);
        const pages = payload?.data?.pages ?? payload?.pages ?? [];
        const sections = pages.flatMap((page: { sections?: Array<{ type: string; isActive?: boolean; settings?: { moodItems?: Array<{ label?: string }> } }> }) => page.sections ?? []);
        const moodSection = sections.find((section: { type: string; isActive?: boolean }) => section.type === "MOOD_STRIP" && section.isActive !== false);
        const moodItems = moodSection?.settings?.moodItems ?? [];
        const nextOptions = moodItems
          .map((item: { label?: string }) => item.label?.trim())
          .filter((label: string | undefined): label is string => Boolean(label))
          .map((label: string) => ({ key: label, label }));

        setMoodOptions(nextOptions);
      } catch {
        setMoodOptions([]);
      }
    }

    void loadMoodOptions();
  }, [selectedRestaurantId, restaurants]);

  useEffect(() => {
    if (!productId || !selectedRestaurantId) {
      return;
    }

    async function loadProduct() {
      try {
        const response = await fetch(`${API_URL}/dashboard/products/${productId}`, {
          headers: selectedRestaurantHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? "تعذر تحميل المنتج.");
        }

        const product = payload?.data as ProductDetails;
        setForm({
          name: product.name ?? "",
          categoryId: product.category?.id ?? "",
          description: product.description ?? "",
          basePrice: String(product.basePrice ?? ""),
          currency: product.currency ?? "ل.س",
          imageUrl: product.images?.[0]?.url ?? "",
          moodKey: product.moodKey ?? "",
          ingredients: product.ingredients?.join("\n") ?? "",
          weight: product.nutrition?.weight ?? "",
          protein: product.nutrition?.protein ?? "",
          breadType: product.nutrition?.breadType ?? "",
          spice: product.nutrition?.spice ?? "",
          model3dUrl: product.media?.model3dUrl ?? "",
          model3dFormat: product.media?.model3dFormat ?? "GLB",
          vrUrl: product.media?.vrUrl ?? "",
          isNew: product.isNew ?? product.isFeatured ?? false,
          isPopular: product.isPopular ?? false
        });
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "تعذر تحميل المنتج.");
      }
    }

    void loadProduct();
  }, [productId, selectedRestaurantId, restaurants]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const headers = {
        "Content-Type": "application/json",
        ...selectedRestaurantHeaders()
      };

      const response = await fetch(`${API_URL}/dashboard/products${productId ? `/${productId}` : ""}`, {
        method: productId ? "PATCH" : "POST",
        headers,
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          basePrice: Number(form.basePrice),
          currency: form.currency,
          categoryId: form.categoryId || undefined,
          moodKey: form.moodKey || undefined,
          imageUrl: form.imageUrl,
          ingredients: form.ingredients
            .split(/\r?\n|،|,/)
            .map((item) => item.trim())
            .filter(Boolean),
          nutrition: {
            weight: form.weight,
            protein: form.protein,
            breadType: form.breadType,
            spice: form.spice
          },
          model3dUrl: form.model3dUrl,
          model3dFormat: form.model3dFormat,
          vrUrl: form.vrUrl,
          vrType: form.vrUrl ? "PANORAMA" : "",
          isFeatured: form.isNew,
          isNew: form.isNew,
          isPopular: form.isPopular
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "تعذر حفظ المنتج. تأكد من تشغيل API وتسجيل الدخول الحقيقي.");
      }

      setStatus("success");
      setMessage("تم حفظ المنتج بنجاح.");
      setTimeout(() => router.push("/dashboard/products"), 700);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "حدث خطأ أثناء الحفظ.");
    }
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadStatus("uploading");
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "IMAGE");
      body.append("altText", form.name || file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: selectedRestaurantHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع الصورة.");
      }

      update("imageUrl", payload?.data?.url ?? payload?.url ?? "");
      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الصورة.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleModelUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setModelUploadStatus("uploading");
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "MODEL_3D");
      body.append("altText", form.name || file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: selectedRestaurantHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع ملف 3D. تأكد أن الباقة تدعم 3D وأن الملف GLB أو GLTF.");
      }

      update("model3dUrl", payload?.data?.url ?? payload?.url ?? "");
      update("model3dFormat", inferModelFormat(file.name));
      setModelUploadStatus("idle");
    } catch (error) {
      setModelUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع ملف 3D.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <form className="product-form-page" onSubmit={handleSubmit}>
      <section className="products-header">
        <div>
          <Link className="back-link" href="/dashboard/products">
            <ArrowRight size={18} />
            المنتجات
          </Link>
          <h1>إضافة منتج</h1>
          <p>الحقول هنا مطابقة لمسار API الحالي، وسيتم توسيعها لاحقًا للخيارات والإضافات والوسائط.</p>
        </div>
        <button className="primary-action" type="submit" disabled={status === "saving"}>
          {status === "saving" ? <Loader2 className="spin" size={22} /> : <Save size={22} />}
          حفظ المنتج
        </button>
      </section>

      <section className="product-form-layout">
        <div className="product-form-card">
          <label className="full">
            <span>المطعم</span>
            <input value={selectedRestaurantName || selectedRestaurantId} readOnly required />
          </label>

          <label>
            <span>اسم المنتج</span>
            <input value={form.name} onChange={(event) => update("name", event.target.value)} required />
          </label>

          <label>
            <span>القسم</span>
            <select value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)}>
              <option value="">بدون قسم</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>شو مزاجك اليوم</span>
            <select value={form.moodKey} onChange={(event) => update("moodKey", event.target.value)}>
              <option value="">لا يظهر ضمن شو مزاجك اليوم</option>
              {moodOptions.map((mood) => (
                <option key={mood.key} value={mood.key}>
                  {mood.label}
                </option>
              ))}
            </select>
          </label>

          <label className="full">
            <span>الوصف</span>
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              rows={4}
            />
          </label>

          <label className="full">
            <span>مكونات الوجبة</span>
            <textarea
              value={form.ingredients}
              onChange={(event) => update("ingredients", event.target.value)}
              placeholder={"بطاطا\nجبنة\nصوص خاص"}
              rows={4}
            />
          </label>

          <label>
            <span>السعر</span>
            <input
              value={form.basePrice}
              onChange={(event) => update("basePrice", event.target.value)}
              type="number"
              min="0"
              required
            />
          </label>

          <label>
            <span>العملة</span>
            <input value={form.currency} onChange={(event) => update("currency", event.target.value)} />
          </label>

          <label>
            <span>الوزن التقريبي</span>
            <input value={form.weight} onChange={(event) => update("weight", event.target.value)} placeholder="350 غ" />
          </label>

          <label>
            <span>نوع البروتين</span>
            <input value={form.protein} onChange={(event) => update("protein", event.target.value)} placeholder="دجاج / لحم" />
          </label>

          <label>
            <span>نوع الخبز</span>
            <input value={form.breadType} onChange={(event) => update("breadType", event.target.value)} placeholder="صمون / تورتيلا" />
          </label>

          <label>
            <span>مستوى الحدة</span>
            <input value={form.spice} onChange={(event) => update("spice", event.target.value)} placeholder="خفيف / متوسط / حار" />
          </label>

          <label className="full">
            <span>صورة المنتج</span>
            <input accept="image/*" disabled={!selectedRestaurantId || uploadStatus === "uploading"} onChange={handleImageUpload} type="file" />
          </label>

          <label className="full">
            <span>رابط الصورة بعد الرفع</span>
            <input value={form.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} />
          </label>

          <label className="full">
            <span>رفع ملف 3D للوجبة</span>
            <input
              accept=".glb,.gltf,.usdz,model/gltf-binary,model/gltf+json"
              disabled={!selectedRestaurantId || modelUploadStatus === "uploading"}
              onChange={handleModelUpload}
              type="file"
            />
            <small className="field-hint">ارفع ملف GLB أو GLTF. بعد الرفع سيتم تعبئة الرابط تلقائياً.</small>
          </label>

          <label className="full">
            <span>رابط ملف 3D للوجبة</span>
            <input value={form.model3dUrl} onChange={(event) => update("model3dUrl", event.target.value)} placeholder="https://.../meal.glb" />
          </label>

          <label>
            <span>نوع ملف 3D</span>
            <select value={form.model3dFormat} onChange={(event) => update("model3dFormat", event.target.value)}>
              <option value="GLB">GLB</option>
              <option value="GLTF">GLTF</option>
              <option value="USDZ">USDZ</option>
            </select>
          </label>

          <label>
            <span>رابط VR / بانوراما</span>
            <input value={form.vrUrl} onChange={(event) => update("vrUrl", event.target.value)} placeholder="https://.../panorama.jpg" />
          </label>

          <label className="checkbox-row full">
            <input
              checked={form.isPopular}
              onChange={(event) => update("isPopular", event.target.checked)}
              type="checkbox"
            />
            <span>عرض المنتج ضمن الأكثر طلباً</span>
          </label>

          <label className="checkbox-row full">
            <input
              checked={form.isNew}
              onChange={(event) => update("isNew", event.target.checked)}
              type="checkbox"
            />
            <span>عرض المنتج ضمن جديدنا</span>
          </label>

          {uploadStatus === "uploading" ? <p className="form-message success">يتم رفع الصورة...</p> : null}
          {modelUploadStatus === "uploading" ? <p className="form-message success">يتم رفع ملف 3D...</p> : null}
          {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}
        </div>

        <aside className="product-preview-card">
          <div>
            <ImagePlus size={32} />
            <span>معاينة المنتج</span>
          </div>
          <img src={form.imageUrl || "/assets/public/menu-products.png"} alt={form.name || "معاينة"} />
          <h2>{form.name || "اسم المنتج"}</h2>
          <p>{form.description || "وصف مختصر للمنتج سيظهر هنا."}</p>
          {form.ingredients ? <small>{form.ingredients.split(/\r?\n|،|,/).map((item) => item.trim()).filter(Boolean).join(" - ")}</small> : null}
          <b>
            {form.basePrice || "0"} {form.currency}
          </b>
        </aside>
      </section>
    </form>
  );
}
