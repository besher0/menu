"use client";

import { ChangeEvent, Fragment, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type * as React from "react";
import Link from "next/link";
import {
  Edit3,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Menu,
  Plus,
  Save,
  Trash2,
  Upload,
  WalletCards
} from "lucide-react";
import { API_URL, apiFetch } from "@/lib/client-api";
import { SkeletonTable } from "@/components/ui/skeleton";
import { authHeaders, getBrowserSession, resolveStoredRestaurant, setStoredRestaurant } from "@/lib/session";

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
type SplashScreenSettings = {
  logoUrl?: string | null;
  backgroundType: "COLOR" | "IMAGE";
  backgroundColor: string;
  backgroundImageUrl?: string | null;
  logoX: number;
  logoY: number;
};
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
    productOpenMode?: "MODAL" | "PAGE";
    splashScreen: SplashScreenSettings;
  };
  branch: { id: string; name: string; openingHours: OpeningHour[] } | null;
};

const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const fallbackBanner = "/assets/public/menu-home.png";
const defaultSplashScreenSettings: SplashScreenSettings = {
  logoUrl: "",
  backgroundType: "COLOR",
  backgroundColor: "#e51f2a",
  backgroundImageUrl: "",
  logoX: 50,
  logoY: 50
};
const texturedBackground =
  "radial-gradient(circle at 18% 20%, rgba(255,255,255,.18), transparent 18%), linear-gradient(135deg, #b91c12, #e53322 58%, #7f120b)";
const pageIncrement = 10;

type ProductGroup = {
  key: string;
  name: string;
  items: Product[];
};

type ImportPreviewRow = {
  rowNumber: number;
  name: string;
  category: string;
  basePrice: number | null;
  isPopular: boolean;
  isNew: boolean;
  moodKeys: string[];
  ingredients: string[];
  mealDetails: string[];
  imagesCount: number;
  isValid: boolean;
  errors: string[];
};

type ImportPreview = {
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    imagesCount: number;
    wouldImport: number;
    pages: number;
  };
  globalErrors: string[];
  rows: ImportPreviewRow[];
};

function useRestaurantGate() {
  const [status, setStatus] = useState<"checking" | "ready" | "select">("checking");
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);

  useEffect(() => {
    async function resolveContext() {
      const params = new URLSearchParams(window.location.search);
      const queryId = params.get("restaurantId");
      const querySlug = params.get("restaurantSlug");
      const queryName = params.get("restaurantName") ?? undefined;

      if (queryId && querySlug && setStoredRestaurant({ id: queryId, slug: querySlug, name: queryName })) {
        setStatus("ready");
        return;
      }

      const session = getBrowserSession();
      const stored = resolveStoredRestaurant(session);
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
  const [visibleLimit, setVisibleLimit] = useState(pageIncrement);
  const [status, setStatus] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "unavailable">("all");
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [dragProduct, setDragProduct] = useState<{ id: string; categoryKey: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const cancelledPriceEditRef = useRef<string | null>(null);

  const load = useCallback(async (limit = visibleLimit, nextSearch = search) => {
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: String(limit),
        sort: "sortOrder",
        availability,
        ...(nextSearch ? { search: nextSearch } : {})
      });
      const result = await apiFetch<PageResult<Product>>(`/dashboard/products?${params.toString()}`);
      setProducts(result.data);
      setMeta(result.meta);
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل المنيو.");
      setStatus("error");
    }
  }, [availability, search, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(pageIncrement);
    void load(pageIncrement, search);
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

  async function saveOrder(next: Product[]) {
    setProducts(next);
    await apiFetch<PageResult<Product>>("/dashboard/products/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: next.map((product, itemIndex) => ({ id: product.id, sortOrder: itemIndex })) })
    });
    void load(visibleLimit);
  }

  async function dropProduct(targetProduct: Product) {
    if (!dragProduct || dragProduct.id === targetProduct.id) return;
    if (dragProduct.categoryKey !== productCategoryKey(targetProduct)) return;

    const fromIndex = products.findIndex((product) => product.id === dragProduct.id);
    const toIndex = products.findIndex((product) => product.id === targetProduct.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...products];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDragProduct(null);
    await saveOrder(next);
  }

  function startPriceEdit(product: Product) {
    setEditingPriceId(product.id);
    setPriceDraft(String(product.basePrice));
  }

  function cancelPriceEdit() {
    cancelledPriceEditRef.current = editingPriceId;
    setEditingPriceId(null);
    setPriceDraft("");
  }

  async function savePrice(product: Product) {
    if (cancelledPriceEditRef.current === product.id) {
      cancelledPriceEditRef.current = null;
      return;
    }
    if (editingPriceId !== product.id) return;
    const nextPrice = Number(priceDraft);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setMessage("السعر يجب أن يكون رقماً أكبر أو يساوي صفر.");
      setStatus("error");
      return;
    }

    setEditingPriceId(null);
    setStatus("saving");
    try {
      const updated = await apiFetch<Product>(`/dashboard/products/${product.id}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basePrice: nextPrice })
      });
      setProducts((current) => current.map((item) => (item.id === product.id ? updated : item)));
      setPriceDraft("");
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحديث السعر.");
      setStatus("error");
    }
  }

  async function remove(product: Product) {
    setStatus("saving");
    try {
      await apiFetch<{ deleted: boolean }>(`/dashboard/products/${product.id}`, { method: "DELETE" });
      void load(visibleLimit);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حذف الصنف.");
      setStatus("error");
    }
  }

  function applyFilters() {
    setVisibleLimit(pageIncrement);
    void load(pageIncrement, search);
  }

  function loadMore() {
    const nextLimit = visibleLimit + pageIncrement;
    setVisibleLimit(nextLimit);
    void load(nextLimit);
  }

  const productGroups = groupProducts(products);

  return (
    <div className="restaurant-dashboard-page">
      <DashboardToolbar
        addHref="/dashboard/products/new"
        search={search}
        onSearch={setSearch}
        onApply={applyFilters}
        actions={(
          <button className="secondary-action" type="button" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet size={20} />
            استيراد من Excel
          </button>
        )}
      >
        <select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)}>
          <option value="all">كل الحالات</option>
          <option value="available">متوفر</option>
          <option value="unavailable">غير متوفر</option>
        </select>
      </DashboardToolbar>
      <DataPanel meta={meta} shown={products.length} onLoadMore={loadMore} loadingMore={status === "saving"}>
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
              {productGroups.map((group) => (
                <Fragment key={group.key}>
                  <tr className="table-group-row">
                    <td colSpan={8}>{group.name}</td>
                  </tr>
                  {group.items.map((product) => (
                    <tr
                      key={product.id}
                      className={dragProduct?.id === product.id ? "dragging-row" : undefined}
                      onDragOver={(event) => {
                        if (dragProduct?.categoryKey === productCategoryKey(product)) event.preventDefault();
                      }}
                      onDrop={() => void dropProduct(product)}
                    >
                      <td><NameCell title={product.name} imageUrl={product.images?.[0]?.url} /></td>
                      <td>{product.category?.name ?? "-"}</td>
                      <td className="editable-price-cell">
                        {editingPriceId === product.id ? (
                          <input
                            autoFocus
                            className="inline-price-input"
                            min="0"
                            step="0.01"
                            type="number"
                            value={priceDraft}
                            onBlur={() => void savePrice(product)}
                            onChange={(event) => setPriceDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                              if (event.key === "Escape") cancelPriceEdit();
                            }}
                          />
                        ) : (
                          <button className="inline-price" type="button" onDoubleClick={() => startPriceEdit(product)}>
                            {product.basePrice} {product.currency}
                          </button>
                        )}
                      </td>
                      <td><button className="bare" type="button" onClick={() => void toggle(product)}><StatusPill active={product.isAvailable} /></button></td>
                      <td><span className="soft-pill purple">{product.isNew ? "جديد" : "عادي"}</span></td>
                      <td>{product.views ?? 0}</td>
                      <td>
                        <DragHandle
                          disabled={false}
                          onDragEnd={() => setDragProduct(null)}
                          onDragStart={() => setDragProduct({ id: product.id, categoryKey: productCategoryKey(product) })}
                        />
                      </td>
                      <td>
                        <RowActions
                          editHref={`/dashboard/products/${product.id}/edit`}
                          deleteMessage={`سيتم حذف المنتج "${product.name}" بعد التأكيد. لا يتم تنفيذ الحذف قبل الضغط على زر التأكيد.`}
                          deleteTitle="تأكيد حذف المنتج"
                          onDelete={() => remove(product)}
                        />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : null}
      </DataPanel>
      {importOpen ? (
        <ProductImportModal
          onClose={() => setImportOpen(false)}
          onImported={(count) => {
            setImportOpen(false);
            setMessage(`تم استيراد ${count} منتج بنجاح`);
            setStatus("ready");
            void load(visibleLimit);
          }}
        />
      ) : null}
    </div>
  );
}

function ProductImportModal({ onClose, onImported }: { onClose: () => void; onImported: (count: number) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [status, setStatus] = useState<"idle" | "previewing" | "importing" | "error">("idle");
  const [message, setMessage] = useState("");

  const importBlockReason = getImportBlockReason(file, preview);
  const canImport = Boolean(file && preview && !importBlockReason);

  async function downloadTemplate() {
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/dashboard/products/import/template`, {
        headers: authHeaders(),
        cache: "no-store"
      });
      if (!response.ok) throw new Error("تعذر تحميل نموذج Excel.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "products-import-template.xlsx";
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر تحميل نموذج Excel.");
    }
  }

  async function previewFile(nextFile = file) {
    if (!nextFile) {
      setStatus("error");
      setMessage("اختر ملف Excel أولاً.");
      return;
    }

    setStatus("previewing");
    setMessage("");
    const formData = new FormData();
    formData.append("file", nextFile);

    try {
      const response = await fetch(`${API_URL}/dashboard/products/import/preview`, {
        method: "POST",
        headers: authHeaders(),
        body: formData
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiErrorMessage(payload, "تعذر قراءة ملف Excel."));

      setPreview(unwrapData<ImportPreview>(payload));
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "تعذر قراءة ملف Excel.");
    }
  }

  async function importFile() {
    if (!file || !preview || !canImport) {
      setStatus("error");
      setMessage(importBlockReason || "اختر ملف Excel صالح قبل الاستيراد.");
      return;
    }

    setStatus("importing");
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/dashboard/products/import`, {
        method: "POST",
        headers: authHeaders(),
        body: formData
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiErrorMessage(payload, "تعذر استيراد المنتجات."));

      const result = unwrapData<{ importedCount: number }>(payload);
      if (!Number.isFinite(result.importedCount) || result.importedCount < 1) {
        throw new Error("انتهى الاستيراد بدون إضافة منتجات. تأكد أن الملف يحتوي صفوف صالحة.");
      }
      onImported(result.importedCount);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر استيراد المنتجات.");
    }
  }

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setMessage("");
    if (nextFile) void previewFile(nextFile);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="confirm-dialog product-import-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-title-row">
          <h2>استيراد منتجات Excel</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </div>
        <div className="import-actions">
          <button className="secondary-action" type="button" onClick={() => void downloadTemplate()}>
            <FileSpreadsheet size={18} />
            تحميل نموذج Excel
          </button>
          <label
            className="import-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              selectFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input accept=".xlsx" type="file" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
            <Upload size={22} />
            <span>{file ? file.name : "اسحب ملف .xlsx هنا أو اختره"}</span>
          </label>
        </div>

        {message ? <p className="form-message">{message}</p> : null}
        {preview ? (
          <div className="import-preview">
            <div className="restaurant-panel-meta">
              <span>عرض {preview.summary.totalRows} صف</span>
              <span>صالح: {preview.summary.validRows}</span>
              <span>غير صالح: {preview.summary.invalidRows}</span>
              <span>الصور: {preview.summary.imagesCount}</span>
              <span>عدد الصفحات: {preview.summary.pages}</span>
            </div>
            {importBlockReason ? <p className="form-message import-block-message">{importBlockReason}</p> : null}
            {preview.globalErrors.length ? (
              <ul className="import-error-list">
                {preview.globalErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            ) : null}
            <div className="table-scroll">
              <table className="restaurant-table import-preview-table">
                <thead>
                  <tr>
                    <th>الصف</th>
                    <th>المنتج</th>
                    <th>القسم</th>
                    <th>السعر</th>
                    <th>الأكثر طلباً</th>
                    <th>جديدنا</th>
                    <th>شو مزاجك اليوم</th>
                    <th>المكونات</th>
                    <th>تفاصيل الوجبة</th>
                    <th>الصور</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 30).map((row) => (
                    <tr key={row.rowNumber} className={row.isValid ? undefined : "import-invalid-row"}>
                      <td>{row.rowNumber}</td>
                      <td>{row.name || "-"}</td>
                      <td>{row.category || "-"}</td>
                      <td>{row.basePrice ?? "-"}</td>
                      <td>{row.isPopular ? "نعم" : "-"}</td>
                      <td>{row.isNew ? "نعم" : "-"}</td>
                      <td>{formatImportPreviewList(row.moodKeys)}</td>
                      <td>{formatImportPreviewList(row.ingredients)}</td>
                      <td>{formatImportPreviewList(row.mealDetails)}</td>
                      <td>{row.imagesCount}</td>
                      <td>{row.isValid ? "جاهز" : row.errors.join(" | ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="confirm-actions">
          <button className="secondary-action" type="button" onClick={onClose}>إلغاء</button>
          <button className="primary-action" type="button" disabled={!canImport || status === "importing"} onClick={() => void importFile()}>
            {status === "importing" || status === "previewing" ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            استيراد المنتجات
          </button>
        </div>
      </section>
    </div>
  );
}

function unwrapData<T>(payload: unknown): T {
  const record = payload && typeof payload === "object" ? payload as { data?: T } : {};
  return (record.data ?? payload) as T;
}

function getImportBlockReason(file: File | null, preview: ImportPreview | null) {
  if (!file) return "";
  if (!preview) return "بانتظار قراءة ملف Excel.";
  if (preview.globalErrors.length) return preview.globalErrors[0];
  if (preview.summary.invalidRows > 0) return `يوجد ${preview.summary.invalidRows} صف غير صالح. أصلح الأخطاء الظاهرة في الجدول ثم أعد الاستيراد.`;
  if (preview.summary.validRows < 1) return "لا يوجد منتجات صالحة للاستيراد داخل الملف.";
  return "";
}

function formatImportPreviewList(values: string[] | undefined) {
  return values?.length ? values.join("، ") : "-";
}

function readApiErrorMessage(payload: unknown, fallback: string) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
  const preview = (record.preview && typeof record.preview === "object" ? record.preview : data.preview) as ImportPreview | undefined;
  const message = record.message ?? record.error ?? data.message;

  if (Array.isArray(message)) return message.join(" | ");
  if (typeof message === "string" && message.trim()) return message;
  if (preview?.globalErrors?.length) return preview.globalErrors.join(" | ");
  return fallback;
}

export function RestaurantCategoriesClient() {
  return withRestaurantGate(<CategoriesTable />, "/dashboard/categories");
}

function CategoriesTable() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 10, total: 0, pages: 1 });
  const [visibleLimit, setVisibleLimit] = useState(pageIncrement);
  const [status, setStatus] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);

  const load = useCallback(async (limit = visibleLimit, nextSearch = search) => {
    try {
      const params = new URLSearchParams({ page: "1", limit: String(limit), sort: "sortOrder", ...(nextSearch ? { search: nextSearch } : {}) });
      const result = await apiFetch<PageResult<Category>>(`/dashboard/categories?${params.toString()}`);
      setCategories(result.data);
      setMeta(result.meta);
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الأقسام.");
      setStatus("error");
    }
  }, [search, visibleLimit]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisibleLimit(pageIncrement);
      void load(pageIncrement, search);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [search]);

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
      void load(visibleLimit);
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

  async function saveCategoryOrder(next: Category[]) {
    setCategories(next);
    await apiFetch<PageResult<Category>>("/dashboard/categories/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: next.map((category, itemIndex) => ({ id: category.id, sortOrder: itemIndex })) })
    });
    void load(visibleLimit);
  }

  async function dropCategory(targetCategory: Category) {
    if (!dragCategoryId || dragCategoryId === targetCategory.id || targetCategory.slug === "all") return;
    const fromIndex = categories.findIndex((category) => category.id === dragCategoryId);
    const toIndex = categories.findIndex((category) => category.id === targetCategory.id);
    if (fromIndex < 0 || toIndex < 0 || categories[fromIndex]?.slug === "all") return;

    const next = [...categories];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    if (next[0]?.slug !== "all") {
      next.sort((first, second) => (first.slug === "all" ? -1 : second.slug === "all" ? 1 : 0));
    }
    setDragCategoryId(null);
    await saveCategoryOrder(next);
  }

  async function remove(category: Category) {
    setStatus("saving");
    try {
      await apiFetch<Category>(`/dashboard/categories/${category.id}`, { method: "DELETE" });
      void load(visibleLimit);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حذف القسم.");
      setStatus("error");
    }
  }

  function applySearch() {
    setVisibleLimit(pageIncrement);
    void load(pageIncrement, search);
  }

  function loadMore() {
    const nextLimit = visibleLimit + pageIncrement;
    setVisibleLimit(nextLimit);
    void load(nextLimit);
  }

  return (
    <div className="restaurant-dashboard-page">
      <DashboardToolbar addHref="/dashboard/categories/new" search={search} onSearch={setSearch} onApply={applySearch} />
      <DataPanel meta={meta} shown={categories.length} onLoadMore={loadMore} loadingMore={status === "saving"}>
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
              {categories.map((category) => {
                const isAllCategory = category.slug === "all";

                return (
                <tr
                  key={category.id}
                  className={dragCategoryId === category.id ? "dragging-row" : undefined}
                  onDragOver={(event) => {
                    if (dragCategoryId && !isAllCategory) event.preventDefault();
                  }}
                  onDrop={() => void dropCategory(category)}
                >
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
                    <td>
                      <DragHandle
                        disabled={isAllCategory}
                        onDragEnd={() => setDragCategoryId(null)}
                        onDragStart={() => setDragCategoryId(category.id)}
                      />
                    </td>
                  <td>
                    <RowActions
                      editHref={`/dashboard/categories/${category.id}/edit`}
                      deleteMessage={`سيتم حذف القسم "${category.name}" بعد التأكيد. لا يتم تنفيذ الحذف قبل الضغط على زر التأكيد.`}
                      deleteTitle="تأكيد حذف القسم"
                      onDelete={isAllCategory ? undefined : () => remove(category)}
                    />
                  </td>
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
                  <td>
                    <RowActions
                      deleteMessage={`سيتم حذف البنر "${banner.title ?? "بدون عنوان"}" بعد التأكيد. لا يتم تنفيذ الحذف قبل الضغط على زر التأكيد.`}
                      deleteTitle="تأكيد حذف البنر"
                      onDelete={() => remove(banner)}
                    />
                  </td>
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const form = settings?.restaurant;
  const splash = form?.splashScreen ?? defaultSplashScreenSettings;
  const hours = settings?.branch?.openingHours ?? [];

  useEffect(() => {
    setIsSuperAdmin(getBrowserSession()?.user.role === "SUPER_ADMIN");
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

  function updateSplash(patch: Partial<SplashScreenSettings>) {
    setSettings((current) => current
      ? {
          ...current,
          restaurant: {
            ...current.restaurant,
            splashScreen: {
              ...defaultSplashScreenSettings,
              ...current.restaurant.splashScreen,
              ...patch
            }
          }
        }
      : current);
  }

  function updateSplashPercent(key: "logoX" | "logoY", value: string) {
    const parsed = Number(value);
    updateSplash({ [key]: Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 50 });
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

  async function uploadSplashAsset(event: ChangeEvent<HTMLInputElement>, key: "logoUrl" | "backgroundImageUrl") {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("type", "IMAGE");
    body.append("altText", form?.name ?? file.name);
    const response = await fetch(`${API_URL}/dashboard/media/upload`, { method: "POST", headers: authHeaders(), body });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      const url = payload?.data?.url ?? payload?.url ?? "";
      updateSplash(key === "backgroundImageUrl" ? { backgroundImageUrl: url, backgroundType: "IMAGE" } : { logoUrl: url });
      setMessage("تم رفع صورة السبلاش. اضغط حفظ التغييرات لتثبيتها.");
    } else {
      setMessage(payload?.message ?? "تعذر رفع صورة السبلاش.");
    }
    event.target.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setStatus("saving");
    try {
      const { splashScreen: _splashScreen, ...restaurantSettings } = settings.restaurant;
      const next = await apiFetch<DashboardSettings>("/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isSuperAdmin ? settings.restaurant : restaurantSettings),
          openingHours: settings.branch?.openingHours ?? []
        })
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
      {isSuperAdmin ? <section className="settings-card splash-settings-card">
        <h2>سبلاش سكرين</h2>
        <div className="splash-settings-layout">
          <div
            className="splash-settings-preview"
            style={{
              "--admin-splash-bg-color": splash.backgroundColor,
              "--admin-splash-bg-image": splash.backgroundType === "IMAGE" && splash.backgroundImageUrl ? `url(${dashboardAssetUrl(splash.backgroundImageUrl)})` : "none",
              "--admin-splash-logo-x": `${splash.logoX}%`,
              "--admin-splash-logo-y": `${splash.logoY}%`
            } as React.CSSProperties}
          >
            {splash.logoUrl || form.logoUrl ? (
              <img src={dashboardAssetUrl(splash.logoUrl || form.logoUrl)} alt="Splash logo preview" />
            ) : (
              <ImagePlus size={42} />
            )}
          </div>
          <div className="form-grid two">
            <label className="field full">
              <span>لوغو السبلاش</span>
              <input accept="image/*" type="file" onChange={(event) => void uploadSplashAsset(event, "logoUrl")} />
              <input value={splash.logoUrl ?? ""} onChange={(event) => updateSplash({ logoUrl: event.target.value })} placeholder="يستخدم لوغو المطعم إذا تركته فارغاً" />
            </label>
            <label className="field">
              <span>نوع الخلفية</span>
              <select value={splash.backgroundType} onChange={(event) => updateSplash({ backgroundType: event.target.value as SplashScreenSettings["backgroundType"] })}>
                <option value="COLOR">لون</option>
                <option value="IMAGE">صورة</option>
              </select>
            </label>
            <label className="field">
              <span>لون الخلفية</span>
              <input type="color" value={splash.backgroundColor} onChange={(event) => updateSplash({ backgroundColor: event.target.value, backgroundType: "COLOR" })} />
            </label>
            <label className="field full">
              <span>صورة الخلفية</span>
              <input accept="image/*" type="file" onChange={(event) => void uploadSplashAsset(event, "backgroundImageUrl")} />
              <input value={splash.backgroundImageUrl ?? ""} onChange={(event) => updateSplash({ backgroundImageUrl: event.target.value })} placeholder="ارفع صورة أو الصق رابط الصورة" />
            </label>
            <label className="field range-field">
              <span>X: {Math.round(splash.logoX)}%</span>
              <input min="0" max="100" type="range" value={splash.logoX} onChange={(event) => updateSplashPercent("logoX", event.target.value)} />
              <input min="0" max="100" type="number" value={splash.logoX} onChange={(event) => updateSplashPercent("logoX", event.target.value)} />
            </label>
            <label className="field range-field">
              <span>Y: {Math.round(splash.logoY)}%</span>
              <input min="0" max="100" type="range" value={splash.logoY} onChange={(event) => updateSplashPercent("logoY", event.target.value)} />
              <input min="0" max="100" type="number" value={splash.logoY} onChange={(event) => updateSplashPercent("logoY", event.target.value)} />
            </label>
          </div>
        </div>
      </section> : null}
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
        <label className="field">
          <span>طريقة فتح المنتج</span>
          <select value={form.productOpenMode ?? "MODAL"} onChange={(event) => updateField("productOpenMode", event.target.value as "MODAL" | "PAGE")}>
            <option value="MODAL">بوب أب</option>
            <option value="PAGE">صفحة تفاصيل المنتج</option>
          </select>
        </label>
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
  actions,
  children
}: {
  addHref?: string;
  onAdd?: () => void;
  search?: string;
  onSearch?: (value: string) => void;
  onApply?: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="restaurant-toolbar">
      <div>
        {addHref ? <Link className="primary-action" href={addHref}><Plus size={20} />إضافة</Link> : <button className="primary-action" type="button" onClick={onAdd}><Plus size={20} />إضافة</button>}
        {actions}
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

function DataPanel({
  children,
  meta,
  shown,
  onLoadMore,
  loadingMore
}: {
  children: React.ReactNode;
  meta: Meta;
  shown: number;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  const canLoadMore = shown < meta.total;

  return (
    <section className="restaurant-data-panel">
      <div className="table-scroll">{children}</div>
      <footer>
        <div className="restaurant-panel-meta">
          <span>عرض {shown} من {meta.total}</span>
          <span>عدد الصفحات: {meta.pages}</span>
        </div>
        {onLoadMore ? (
          <button className="restaurant-load-more" disabled={!canLoadMore || loadingMore} type="button" onClick={onLoadMore}>
            {loadingMore ? "جار التحميل..." : "عرض المزيد"}
          </button>
        ) : null}
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

function productCategoryKey(product: Product) {
  return product.category?.name?.trim() || "بدون قسم";
}

function groupProducts(products: Product[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();

  products.forEach((product) => {
    const key = productCategoryKey(product);
    const group = groups.get(key) ?? { key, name: key, items: [] };
    group.items.push(product);
    groups.set(key, group);
  });

  return Array.from(groups.values()).sort((first, second) => {
    if (first.name === "بدون قسم") return 1;
    if (second.name === "بدون قسم") return -1;
    return first.name.localeCompare(second.name, "ar");
  });
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

function DragHandle({
  disabled,
  onDragEnd,
  onDragStart
}: {
  disabled?: boolean;
  onDragEnd: () => void;
  onDragStart: () => void;
}) {
  return (
    <button
      aria-label="سحب لتغيير الترتيب"
      className="drag-handle"
      disabled={disabled}
      draggable={!disabled}
      title={disabled ? "هذا العنصر مثبت" : "اسحب لتغيير الترتيب"}
      type="button"
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
    >
      <Menu size={18} />
    </button>
  );
}

function RowActions({
  editHref,
  onDelete,
  deleteTitle = "تأكيد الحذف",
  deleteMessage = "سيتم تنفيذ الحذف فقط بعد الضغط على زر التأكيد."
}: {
  editHref?: string;
  onDelete?: () => Promise<void> | void;
  deleteTitle?: string;
  deleteMessage?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!onDelete) return;
    setBusy(true);
    await onDelete();
    setBusy(false);
    setConfirmOpen(false);
  }

  return (
    <span className="row-actions">
      {editHref ? <Link href={editHref} aria-label="تعديل"><Edit3 size={20} /></Link> : null}
      {onDelete ? <button type="button" aria-label="حذف" onClick={() => setConfirmOpen(true)}><Trash2 size={20} /></button> : null}
      {confirmOpen ? (
        <ConfirmDialog
          busy={busy}
          confirmLabel="تأكيد الحذف"
          message={deleteMessage}
          title={deleteTitle}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </span>
  );
}

function ConfirmDialog({
  busy,
  cancelLabel = "إلغاء",
  confirmLabel = "تأكيد",
  message,
  title,
  onCancel,
  onConfirm
}: {
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  message: string;
  title: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <div className="confirm-backdrop" role="presentation">
      <div aria-modal="true" className="confirm-dialog" role="dialog">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="ghost-action" disabled={busy} type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className="danger-action" disabled={busy} type="button" onClick={() => void onConfirm()}>
            {busy ? "جار التنفيذ..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, textarea, onChange }: { label: string; value: string; textarea?: boolean; onChange: (value: string) => void }) {
  return <label className={textarea ? "field textarea" : "field"}><span>{label}</span>{textarea ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function LoadingState({ label }: { label: string }) {
  return <div aria-label={label}><SkeletonTable rows={6} columns={5} /></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="restaurant-empty"><b>{title}</b><p>{text}</p></div>;
}
