"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import type * as React from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  WalletCards
} from "lucide-react";
import { API_URL, apiFetch } from "@/lib/client-api";
import { authHeaders, getBrowserSession, getStoredRestaurant, setStoredRestaurant } from "@/lib/session";

type LoadState = "loading" | "ready" | "saving" | "error";
type BackgroundType = "COLOR" | "IMAGE" | "TEXTURE" | "PATTERN" | "GRADIENT";

type Meta = { page: number; limit: number; total: number; pages: number };
type PageResult<T> = { data: T[]; meta: Meta };

type RestaurantOption = { id: string; name: string; slug: string };
type ProductSummary = { id: string; name: string; categoryName?: string; imageUrl?: string | null; views?: number };

type Overview = {
  cards: {
    todayViews?: number;
    menuViews?: number;
    whatsappClicks: number;
    productsCount?: number;
    todayVisits?: number;
    visits?: number;
    products?: number;
  };
  lists: {
    topViewedProducts?: ProductSummary[];
    topViewed?: ProductSummary[];
    newProducts: ProductSummary[];
    unavailableProducts: ProductSummary[];
  };
};

type Product = {
  id: string;
  name: string;
  basePrice: number;
  currency: string;
  isAvailable: boolean;
  isNew: boolean;
  sortOrder: number;
  views?: number;
  category?: { name: string } | null;
  images?: Array<{ url: string }>;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  imagePosition?: string | null;
  color?: string | null;
  backgroundType: BackgroundType;
  backgroundValue?: string | null;
  backgroundOverlay?: string | null;
  backgroundCss?: string | null;
  visualScrollEnabled: boolean;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number };
};

type Banner = {
  id: string;
  title?: string;
  subtitle?: string;
  imageUrl: string;
  targetUrl?: string;
  badge?: string;
  isActive: boolean;
  sortOrder: number;
};

type OpeningHour = { day: number; opensAt: string; closesAt: string; isClosed: boolean };
type DashboardSettings = {
  restaurant: {
    name: string;
    type?: string | null;
    description?: string | null;
    city?: string | null;
    country?: string | null;
    address?: string | null;
    whatsappPhone?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    currency: string;
    showPrices: boolean;
  };
  branch: { id: string; name: string; openingHours: OpeningHour[] } | null;
};

const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const fallbackBanner = "/assets/public/menu-home.png";
const texturedBackground =
  "radial-gradient(circle at 18% 20%, rgba(255,255,255,.18), transparent 18%), linear-gradient(135deg, #b91c12, #e53322 58%, #7f120b)";

function useRestaurantGate() {
  const [status, setStatus] = useState<"checking" | "ready" | "select">("checking");
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);

  useEffect(() => {
    async function resolveContext() {
      const params = new URLSearchParams(window.location.search);
      const queryId = params.get("restaurantId");
      const querySlug = params.get("restaurantSlug");
      const queryName = params.get("restaurantName") ?? undefined;

      if (queryId && querySlug) {
        setStoredRestaurant({ id: queryId, slug: querySlug, name: queryName });
        setStatus("ready");
        return;
      }

      const session = getBrowserSession();
      const stored = getStoredRestaurant();
      if (stored?.id && stored.slug) {
        setStatus("ready");
        return;
      }

      const memberships = session?.memberships.map((membership) => membership.restaurant) ?? [];
      if (session?.user.role !== "SUPER_ADMIN") {
        if (memberships[0]) {
          setStoredRestaurant(memberships[0]);
        }
        setStatus("ready");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/admin/restaurants`, { headers: authHeaders(), cache: "no-store" });
        const payload = await response.json().catch(() => null);
        setRestaurants((payload?.data ?? []) as RestaurantOption[]);
        setStatus("select");
      } catch {
        setRestaurants(memberships);
        setStatus(memberships.length ? "select" : "ready");
      }
    }

    void resolveContext();
  }, []);

  return { status, restaurants };
}

function withRestaurantGate(children: React.ReactNode, targetPath = "/dashboard") {
  return <RestaurantGate targetPath={targetPath}>{children}</RestaurantGate>;
}

function RestaurantGate({ children, targetPath }: { children: React.ReactNode; targetPath: string }) {
  const gate = useRestaurantGate();

  if (gate.status === "checking") return <LoadingState label="يتم تجهيز سياق المطعم" />;
  if (gate.status === "select") return <RestaurantPicker restaurants={gate.restaurants} targetPath={targetPath} />;
  return <>{children}</>;
}

function RestaurantPicker({ restaurants, targetPath }: { restaurants: RestaurantOption[]; targetPath: string }) {
  return (
    <section className="restaurant-picker">
      <h1>اختر مطعماً لفتح الداشبورد</h1>
      <p>كل التبويبات ستستخدم المطعم الذي تختاره هنا.</p>
      <div>
        {restaurants.map((restaurant) => (
          <Link
            key={restaurant.id}
            href={`${targetPath}?restaurantId=${restaurant.id}&restaurantSlug=${restaurant.slug}&restaurantName=${encodeURIComponent(restaurant.name)}`}
          >
            <span>{restaurant.name}</span>
            <small>/{restaurant.slug}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function RestaurantDashboardHomeClient() {
  return withRestaurantGate(<DashboardHome />, "/dashboard");
}

function DashboardHome() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();

    async function load() {
      try {
        setOverview(await apiFetch<Overview>("/dashboard/overview"));
        setStatus("ready");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "تعذر تحميل بيانات الداشبورد.");
        setStatus("error");
      }
    }
  }, []);

  if (status === "loading") return <LoadingState label="يتم تحميل لوحة المطعم" />;
  if (status === "error") return <EmptyState title="تعذر تحميل الداشبورد" text={message} />;

  const cards = overview?.cards;
  const lists = overview?.lists;

  return (
    <div className="restaurant-dashboard-page">
      <section className="restaurant-stats">
        <StatCard label="مشاهدات اليوم" value={cards?.todayViews ?? cards?.todayVisits ?? 0} delta="+8 %" />
        <StatCard label="مشاهدات المنيو" value={cards?.menuViews ?? cards?.visits ?? 0} delta="خلال 7 أيام" />
        <StatCard label="ضغطات الواتس" value={cards?.whatsappClicks ?? 0} delta="+8 %" />
        <StatCard label="عدد الأصناف" value={cards?.productsCount ?? cards?.products ?? 0} delta="+8 %" />
      </section>

      <section className="dashboard-rail">
        <DashboardList title="أكثر الاصناف مشاهدة" href="/dashboard/analytics" items={lists?.topViewedProducts ?? lists?.topViewed ?? []} mode="views" />
        <DashboardList title="الاصناف الجديدة" href="/dashboard/products" items={lists?.newProducts ?? []} mode="new" />
        <DashboardList title="الاصناف الغير متوفرة" href="/dashboard/products" items={lists?.unavailableProducts ?? []} mode="unavailable" />
      </section>
    </div>
  );
}

export function RestaurantProductsClient() {
  return withRestaurantGate(<ProductsTable />, "/dashboard/products");
}

function ProductsTable() {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 10, total: 0, pages: 1 });
  const [status, setStatus] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "unavailable">("all");

  const load = useCallback(async (page = meta.page) => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(meta.limit),
        sort: "sortOrder",
        availability,
        ...(search ? { search } : {})
      });
      const result = await apiFetch<PageResult<Product>>(`/dashboard/products?${params.toString()}`);
      setProducts(result.data);
      setMeta(result.meta);
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل المنيو.");
      setStatus("error");
    }
  }, [availability, meta.limit, meta.page, search]);

  useEffect(() => {
    void load(1);
  }, [availability]);

  async function toggle(product: Product) {
    setStatus("saving");
    try {
      const updated = await apiFetch<Product>(`/dashboard/products/${product.id}/toggle-availability`, { method: "PATCH" });
      setProducts((current) => current.map((item) => (item.id === product.id ? updated : item)));
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحديث حالة الصنف.");
      setStatus("error");
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= products.length) return;
    const next = [...products];
    [next[index], next[target]] = [next[target], next[index]];
    const base = (meta.page - 1) * meta.limit;
    setProducts(next);
    await apiFetch<PageResult<Product>>("/dashboard/products/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: next.map((product, itemIndex) => ({ id: product.id, sortOrder: base + itemIndex })) })
    });
    void load(meta.page);
  }

  async function remove(product: Product) {
    setStatus("saving");
    try {
      await apiFetch<{ deleted: boolean }>(`/dashboard/products/${product.id}`, { method: "DELETE" });
      void load(meta.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حذف الصنف.");
      setStatus("error");
    }
  }

  return (
    <div className="restaurant-dashboard-page">
      <DashboardToolbar addHref="/dashboard/products/new" search={search} onSearch={setSearch} onApply={() => void load(1)}>
        <select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)}>
          <option value="all">كل الحالات</option>
          <option value="available">متوفر</option>
          <option value="unavailable">غير متوفر</option>
        </select>
      </DashboardToolbar>
      <DataPanel meta={meta} onPage={(page) => void load(page)}>
        {status === "loading" ? <LoadingState label="يتم تحميل المنيو" /> : null}
        {status === "error" ? <EmptyState title="حدث خطأ" text={message} /> : null}
        {status !== "loading" && products.length === 0 ? <EmptyState title="لا توجد أصناف" text="أضف الأصناف من زر إضافة لتظهر في صفحة المستخدم." /> : null}
        {products.length > 0 ? (
          <table className="restaurant-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>القسم</th>
                <th>السعر</th>
                <th>الحالة</th>
                <th>النوع</th>
                <th>المشاهدات</th>
                <th>الترتيب</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => (
                <tr key={product.id}>
                  <td><NameCell title={product.name} imageUrl={product.images?.[0]?.url} /></td>
                  <td>{product.category?.name ?? "-"}</td>
                  <td>{product.basePrice} {product.currency}</td>
                  <td><button className="bare" type="button" onClick={() => void toggle(product)}><StatusPill active={product.isAvailable} /></button></td>
                  <td><span className="soft-pill purple">{product.isNew ? "جديد" : "عادي"}</span></td>
                  <td>{product.views ?? 0}</td>
                  <td><ReorderButtons index={index} length={products.length} onMove={move} /></td>
                  <td><RowActions editHref={`/dashboard/products/${product.id}/edit`} onDelete={() => void remove(product)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </DataPanel>
    </div>
  );
}

export function RestaurantCategoriesClient() {
  return withRestaurantGate(<CategoriesTable />, "/dashboard/categories");
}

function CategoriesTable() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 10, total: 0, pages: 1 });
  const [status, setStatus] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async (page = 1, nextSearch = search) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(meta.limit), sort: "sortOrder", ...(nextSearch ? { search: nextSearch } : {}) });
      const result = await apiFetch<PageResult<Category>>(`/dashboard/categories?${params.toString()}`);
      setCategories(result.data);
      setMeta(result.meta);
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الأقسام.");
      setStatus("error");
    }
  }, [meta.limit, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1, search);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [load, search]);

  async function addCategory() {
    setStatus("saving");
    try {
      await apiFetch<Category>("/dashboard/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `قسم جديد ${meta.total + 1}`,
          color: "#ed1f2b",
          backgroundType: "GRADIENT",
          backgroundValue: texturedBackground,
          visualScrollEnabled: true,
          sortOrder: meta.total
        })
      });
      void load(meta.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إضافة القسم.");
      setStatus("error");
    }
  }

  async function update(category: Category, patch: Partial<Category>) {
    const body = { ...category, ...patch };
    const updated = await apiFetch<Category>(`/dashboard/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setCategories((current) => current.map((item) => (item.id === category.id ? updated : item)));
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    if (categories[index]?.slug === "all" || categories[target]?.slug === "all") return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    const base = (meta.page - 1) * meta.limit;
    setCategories(next);
    await apiFetch<PageResult<Category>>("/dashboard/categories/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: next.map((category, itemIndex) => ({ id: category.id, sortOrder: base + itemIndex })) })
    });
    void load(meta.page);
  }

  async function remove(category: Category) {
    setStatus("saving");
    try {
      await apiFetch<Category>(`/dashboard/categories/${category.id}`, { method: "DELETE" });
      void load(meta.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حذف القسم.");
      setStatus("error");
    }
  }

  return (
    <div className="restaurant-dashboard-page">
      <DashboardToolbar addHref="/dashboard/categories/new" search={search} onSearch={setSearch} onApply={() => void load(1, search)} />
      <DataPanel meta={meta} onPage={(page) => void load(page)}>
        {status === "loading" ? <LoadingState label="يتم تحميل الأقسام" /> : null}
        {status === "error" ? <EmptyState title="حدث خطأ" text={message} /> : null}
        {status !== "loading" && categories.length === 0 ? <EmptyState title="لا توجد أقسام" text="أضف أول قسم ليظهر في صفحة المستخدم." /> : null}
        {categories.length > 0 ? (
          <table className="restaurant-table visual-table">
            <thead>
              <tr>
                <th>الخلفية</th>
                <th>القسم</th>
                <th>الأيقونة</th>
                <th>عدد الأصناف</th>
                <th>الحالة</th>
                <th>نوع الخلفية</th>
                <th>قيمة الخلفية</th>
                <th>سكرول وهمي</th>
                <th>الترتيب</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category, index) => {
                const isAllCategory = category.slug === "all";

                return (
                <tr key={category.id}>
                  <td><span className="category-bg" style={visualBackground(category)} /></td>
                  <td>{category.name}</td>
                  <td>{category.imageUrl ? <img className="category-icon" src={category.imageUrl} alt="" /> : <span className="category-icon empty" />}</td>
                  <td>{isAllCategory ? "كل المنتجات" : category._count?.products ?? 0}</td>
                  <td><button className="bare" type="button" disabled={isAllCategory} onClick={() => void update(category, { isActive: !category.isActive })}><StatusPill active={isAllCategory ? true : category.isActive} label={isAllCategory || category.isActive ? "ظاهر" : "مخفي"} /></button></td>
                  <td>
                    <select value={category.backgroundType} onChange={(event) => void update(category, { backgroundType: event.target.value as BackgroundType })}>
                      <option value="COLOR">لون</option>
                      <option value="IMAGE">صورة</option>
                      <option value="TEXTURE">خامة</option>
                      <option value="PATTERN">نقشة</option>
                      <option value="GRADIENT">تدرج</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={category.backgroundValue ?? category.color ?? ""}
                      onChange={(event) => void update(category, { backgroundValue: event.target.value })}
                      placeholder="لون أو رابط أو CSS"
                    />
                  </td>
                  <td><input checked={category.visualScrollEnabled} type="checkbox" onChange={(event) => void update(category, { visualScrollEnabled: event.target.checked })} /></td>
                    <td><ReorderButtons index={index} length={categories.length} locked={isAllCategory} minIndex={categories[0]?.slug === "all" ? 1 : 0} onMove={move} /></td>
                  <td><RowActions editHref={`/dashboard/categories/${category.id}/edit`} onDelete={isAllCategory ? undefined : () => void remove(category)} /></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </DataPanel>
    </div>
  );
}

export function RestaurantBannersClient() {
  return withRestaurantGate(<BannersTable />, "/dashboard/banners");
}

function BannersTable() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [uploadingBannerId, setUploadingBannerId] = useState<string | null>(null);

  async function load() {
    try {
      setBanners(await apiFetch<Banner[]>("/dashboard/banners"));
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل البنرات.");
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addBanner() {
    const next = await apiFetch<Banner[]>("/dashboard/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "عرض جديد", imageUrl: fallbackBanner, targetUrl: "/menu", isActive: true, sortOrder: banners.length })
    });
    setBanners(next);
  }

  async function update(banner: Banner, patch: Partial<Banner>) {
    const next = await apiFetch<Banner[]>(`/dashboard/banners/${banner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...banner, ...patch })
    });
    setBanners(next);
  }

  async function remove(banner: Banner) {
    setBanners(await apiFetch<Banner[]>(`/dashboard/banners/${banner.id}`, { method: "DELETE" }));
  }

  async function uploadBannerImage(banner: Banner, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingBannerId(banner.id);
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "IMAGE");
      body.append("altText", banner.title || file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: authHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع صورة البنر.");
      }

      const imageUrl = payload?.data?.url ?? payload?.url ?? "";
      if (!imageUrl) {
        throw new Error("لم يرجع رابط الصورة من الخادم.");
      }

      await update(banner, { imageUrl });
      setMessage("تم رفع صورة البنر وظهورها مباشرة في صفحة المستخدم.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر رفع صورة البنر.");
      setStatus("error");
    } finally {
      setUploadingBannerId(null);
      event.target.value = "";
    }
  }

  return (
    <div className="restaurant-dashboard-page">
      <DashboardToolbar onAdd={() => void addBanner()} />
      <section className="restaurant-data-panel">
        {status === "loading" ? <LoadingState label="يتم تحميل البنرات" /> : null}
        {status === "error" ? <EmptyState title="حدث خطأ" text={message} /> : null}
        {status !== "loading" && banners.length === 0 ? <EmptyState title="لا توجد بنرات" text="أضف بنر ليظهر في صفحة المستخدم الرئيسية." /> : null}
        {banners.length > 0 ? (
          <table className="restaurant-table banners-table">
            <thead>
              <tr>
                <th>الصورة</th>
                <th>العنوان</th>
                <th>الرابط</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((banner) => (
                <tr key={banner.id}>
                  <td>
                    <div className="banner-image-cell">
                      <img className="banner-thumb" src={dashboardAssetUrl(banner.imageUrl)} alt="" />
                      <label className="banner-upload-button">
                        {uploadingBannerId === banner.id ? <Loader2 className="spin" size={14} /> : <Upload size={14} />}
                        رفع صورة
                        <input hidden accept="image/*" type="file" onChange={(event) => void uploadBannerImage(banner, event)} />
                      </label>
                    </div>
                  </td>
                  <td><input value={banner.title ?? ""} onChange={(event) => void update(banner, { title: event.target.value })} /></td>
                  <td><input value={banner.targetUrl ?? ""} onChange={(event) => void update(banner, { targetUrl: event.target.value })} placeholder="رابط الانتقال" /></td>
                  <td><button className="bare" type="button" onClick={() => void update(banner, { isActive: !banner.isActive })}><StatusPill active={banner.isActive} label={banner.isActive ? "ظاهر" : "مخفي"} /></button></td>
                  <td><RowActions onDelete={() => void remove(banner)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}

export function RestaurantSettingsClient() {
  return withRestaurantGate(<SettingsForm />, "/dashboard/settings");
}

function SettingsForm() {
  const [settings, setSettings] = useState<DashboardSettings | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const form = settings?.restaurant;
  const hours = settings?.branch?.openingHours ?? [];

  useEffect(() => {
    void load();

    async function load() {
      try {
        setSettings(await apiFetch<DashboardSettings>("/dashboard/settings"));
        setStatus("ready");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "تعذر تحميل الإعدادات.");
        setStatus("error");
      }
    }
  }, []);

  function updateField<K extends keyof DashboardSettings["restaurant"]>(key: K, value: DashboardSettings["restaurant"][K]) {
    setSettings((current) => current ? { ...current, restaurant: { ...current.restaurant, [key]: value } } : current);
  }

  function updateHour(day: number, key: keyof OpeningHour, value: string | boolean) {
    setSettings((current) => {
      if (!current?.branch) return current;
      return {
        ...current,
        branch: {
          ...current.branch,
          openingHours: current.branch.openingHours.map((hour) => (hour.day === day ? { ...hour, [key]: value } : hour))
        }
      };
    });
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("type", "IMAGE");
    body.append("altText", form?.name ?? file.name);
    const response = await fetch(`${API_URL}/dashboard/media/upload`, { method: "POST", headers: authHeaders(), body });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      updateField("logoUrl", payload?.data?.url ?? payload?.url ?? "");
      setMessage("تم رفع الشعار. اضغط حفظ التغييرات لتثبيته.");
    } else {
      setMessage(payload?.message ?? "تعذر رفع الشعار.");
    }
    event.target.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setStatus("saving");
    try {
      const next = await apiFetch<DashboardSettings>("/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings.restaurant, openingHours: settings.branch?.openingHours ?? [] })
      });
      setSettings(next);
      setMessage("تم حفظ التغييرات بنجاح.");
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ الإعدادات.");
      setStatus("error");
    }
  }

  if (status === "loading") return <LoadingState label="يتم تحميل الإعدادات" />;
  if (!settings || !form) return <EmptyState title="لا توجد إعدادات" text={message} />;

  return (
    <form className="restaurant-dashboard-page settings-page" onSubmit={submit}>
      <button className="settings-save" type="submit" disabled={status === "saving"}>
        {status === "saving" ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
        حفظ التغييرات
      </button>
      <h1>اعدادات المطعم</h1>
      <section className="settings-grid">
        <article className="settings-card logo-card">
          <h2>الشعار</h2>
          <div className="logo-preview">{form.logoUrl ? <img src={dashboardAssetUrl(form.logoUrl)} alt="شعار المطعم" /> : <ImagePlus size={46} />}</div>
          <div className="logo-actions">
            <label>
              تغيير الشعار
              <input hidden accept="image/*" type="file" onChange={(event) => void uploadLogo(event)} />
            </label>
            <button type="button" onClick={() => updateField("logoUrl", "")}>حذف</button>
          </div>
        </article>
        <article className="settings-card">
          <h2>معلومات المطعم</h2>
          <div className="form-grid two">
            <Field label="اسم المطعم" value={form.name} onChange={(value) => updateField("name", value)} />
            <Field label="نوع المطعم" value={form.type ?? ""} onChange={(value) => updateField("type", value)} />
            <Field label="العنوان" value={form.address ?? ""} onChange={(value) => updateField("address", value)} />
            <Field label="المدينة" value={form.city ?? ""} onChange={(value) => updateField("city", value)} />
          </div>
          <Field label="نبذة عن المطعم" value={form.description ?? ""} textarea onChange={(value) => updateField("description", value)} />
        </article>
      </section>
      <section className="settings-card">
        <h2>معلومات تواصل</h2>
        <div className="form-grid three">
          <Field label="رقم الواتس" value={form.whatsappPhone ?? ""} onChange={(value) => updateField("whatsappPhone", value)} />
          <Field label="رقم الهاتف" value={form.phone ?? ""} onChange={(value) => updateField("phone", value)} />
          <Field label="البريد الالكتروني (اختياري)" value={form.email ?? ""} onChange={(value) => updateField("email", value)} />
        </div>
      </section>
      <section className="settings-card">
        <h2>العملة والاسعار</h2>
        <button className="bare price-switch" type="button" onClick={() => updateField("showPrices", !form.showPrices)}>
          <StatusPill active={form.showPrices} label="اظهار الاسعار" />
        </button>
        <Field label="العملة" value={form.currency} onChange={(value) => updateField("currency", value)} />
      </section>
      <section className="settings-card working-hours">
        <h2>ساعات العمل</h2>
        {hours.map((hour) => (
          <div key={hour.day} className="hours-row">
            <button className="bare" type="button" onClick={() => updateHour(hour.day, "isClosed", !hour.isClosed)}>
              <StatusPill active={!hour.isClosed} label={days[hour.day]} />
            </button>
            <Field label="من" value={hour.opensAt} onChange={(value) => updateHour(hour.day, "opensAt", value)} />
            <Field label="الى" value={hour.closesAt} onChange={(value) => updateHour(hour.day, "closesAt", value)} />
          </div>
        ))}
      </section>
      {message ? <p className={status === "error" ? "form-message" : "form-message success"}>{message}</p> : null}
    </form>
  );
}

function DashboardToolbar({
  addHref,
  onAdd,
  search,
  onSearch,
  onApply,
  children
}: {
  addHref?: string;
  onAdd?: () => void;
  search?: string;
  onSearch?: (value: string) => void;
  onApply?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="restaurant-toolbar">
      <div>
        {addHref ? <Link className="primary-action" href={addHref}><Plus size={20} />إضافة</Link> : <button className="primary-action" type="button" onClick={onAdd}><Plus size={20} />إضافة</button>}
        <button className="secondary-action" type="button"><Upload size={20} />تصدير</button>
      </div>
      <div className="toolbar-filter-controls">
        {onSearch ? <input value={search ?? ""} onChange={(event) => onSearch(event.target.value)} placeholder="بحث" /> : null}
        {children}
        {onApply ? <button className="filter-button" type="button" onClick={onApply}>تطبيق</button> : null}
      </div>
    </section>
  );
}

function DataPanel({ children, meta, onPage }: { children: React.ReactNode; meta: Meta; onPage: (page: number) => void }) {
  return (
    <section className="restaurant-data-panel">
      <div className="table-scroll">{children}</div>
      <footer>
        <div className="restaurant-pagination">
          <button disabled={meta.page <= 1} type="button" onClick={() => onPage(meta.page - 1)}><ChevronRight size={16} /></button>
          <span>{meta.page} / {meta.pages}</span>
          <button disabled={meta.page >= meta.pages} type="button" onClick={() => onPage(meta.page + 1)}><ChevronLeft size={16} /></button>
        </div>
        <span>عرض {meta.total ? (meta.page - 1) * meta.limit + 1 : 0} من {meta.total}</span>
      </footer>
    </section>
  );
}

function StatCard({ label, value, delta }: { label: string; value: number; delta: string }) {
  return <article className="restaurant-stat"><div><span>{label}</span><strong>{value}</strong><em>{delta}</em></div><i><WalletCards size={24} /></i></article>;
}

function DashboardList({ title, href, items, mode }: { title: string; href: string; items: ProductSummary[]; mode: "views" | "new" | "unavailable" }) {
  return (
    <article className="dashboard-list">
      <header><Link href={href}>عرض الكل</Link><h2>{title}</h2></header>
      {items.length ? items.slice(0, 8).map((item) => (
        <div className="dashboard-list-row" key={item.id}>
          <div><strong>{item.name}</strong><small>{item.categoryName || "-"}</small></div>
          <span className="item-avatar">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}</span>
          {mode === "views" ? <span className="list-meta">{item.views ?? 0} مشاهدة</span> : null}
          {mode === "new" ? <span className="soft-pill green">جديد</span> : null}
          {mode === "unavailable" ? <span className="soft-pill red">غير متوفر</span> : null}
        </div>
      )) : <EmptyState title="لا توجد بيانات" text="ستظهر البيانات بعد زيارات المستخدمين أو إضافة الأصناف." />}
    </article>
  );
}

function visualBackground(category: Pick<Category, "backgroundType" | "backgroundValue" | "color" | "backgroundCss">): React.CSSProperties {
  const value = category.backgroundValue || category.color || "#ed1f2b";
  if (category.backgroundCss) return { background: category.backgroundCss };
  if (category.backgroundType === "IMAGE" || category.backgroundType === "TEXTURE") return { backgroundImage: `url(${value})`, backgroundSize: "cover", backgroundPosition: "center" };
  if (category.backgroundType === "GRADIENT" || category.backgroundType === "PATTERN") return { background: value };
  return { backgroundColor: value };
}

function dashboardAssetUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("/uploads/")) return `${API_URL}${url}`;
  return url;
}

function NameCell({ title, imageUrl }: { title: string; imageUrl?: string | null }) {
  return <span className="table-name-cell"><span className="item-avatar">{imageUrl ? <img src={imageUrl} alt="" /> : null}</span><strong>{title}</strong></span>;
}

function StatusPill({ active, label }: { active: boolean; label?: string }) {
  return <span className="status-switch"><i className={active ? "on" : ""} />{label ?? (active ? "متوفر" : "غير متوفر")}</span>;
}

function ReorderButtons({
  index,
  length,
  locked,
  minIndex = 0,
  onMove
}: {
  index: number;
  length: number;
  locked?: boolean;
  minIndex?: number;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <span className="reorder-buttons">
      <button disabled={locked || index <= minIndex} type="button" onClick={() => void onMove(index, -1)}><ArrowUp size={16} /></button>
      <button disabled={locked || index === length - 1} type="button" onClick={() => void onMove(index, 1)}><ArrowDown size={16} /></button>
    </span>
  );
}

function RowActions({ editHref, onDelete }: { editHref?: string; onDelete?: () => void }) {
  return <span className="row-actions">{editHref ? <Link href={editHref} aria-label="تعديل"><Edit3 size={20} /></Link> : null}{onDelete ? <button type="button" aria-label="حذف" onClick={onDelete}><Trash2 size={20} /></button> : null}</span>;
}

function Field({ label, value, textarea, onChange }: { label: string; value: string; textarea?: boolean; onChange: (value: string) => void }) {
  return <label className={textarea ? "field textarea" : "field"}><span>{label}</span>{textarea ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="restaurant-empty"><Loader2 className="spin" size={28} /><b>{label}</b></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="restaurant-empty"><b>{title}</b><p>{text}</p></div>;
}
