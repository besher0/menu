"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2
} from "lucide-react";
import {
  BUILDER_SECTION_TYPES,
  BuilderSection,
  BuilderSectionSettings,
  BuilderSectionType,
  CATEGORY_NAV_VARIANTS,
  PRODUCT_CARD_VARIANTS,
  SECTION_LABELS,
  defaultSectionSettings
} from "@menu/shared";
import { authHeaders, getBrowserSession } from "@/lib/session";
import { SkeletonForm } from "@/components/ui/skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
type MoodBackgroundType = "COLOR" | "IMAGE" | "TEXTURE" | "PATTERN" | "GRADIENT";

type RestaurantOption = {
  id: string;
  name: string;
  slug: string;
};

type ProductOption = {
  id: string;
  name: string;
  slug?: string;
};

const PRODUCT_CARD_VARIANT_LABELS: Record<string, string> = {
  "wide-image": "عريض بصورة كاملة",
  "featured-overlay-large": "كارد كبير بنص فوق الصورة",
  "horizontal-contained": "أفقي بصورة داخل إطار أبيض",
  "spotlight-contained": "عرض كبير بصورة contained"
};

const CATEGORY_NAV_VARIANT_LABELS: Record<string, string> = {
  "image-chips": "أقسام مع صور",
  "text-tabs": "أقسام نصية مثل Vertigo"
};

function moodBackgroundStyle(item: {
  backgroundType?: MoodBackgroundType;
  backgroundValue?: string | null;
  backgroundCss?: string | null;
  color?: string;
}): React.CSSProperties {
  const value = item.backgroundValue ?? item.color ?? "#d32f2f";

  if (item.backgroundCss) {
    return { background: item.backgroundCss };
  }

  if (item.backgroundType === "IMAGE" || item.backgroundType === "TEXTURE") {
    return { backgroundImage: `url(${value})`, backgroundSize: "cover", backgroundPosition: "center" };
  }

  if (item.backgroundType === "GRADIENT" || item.backgroundType === "PATTERN") {
    return { background: value };
  }

  return { backgroundColor: value };
}

export function MenuBuilderClient() {
  const searchParams = useSearchParams();
  const requestedSectionType = searchParams.get("section");
  const requestedRestaurantId = searchParams.get("restaurantId");
  const [sections, setSections] = useState<BuilderSection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pageId, setPageId] = useState("");
  const [device, setDevice] = useState<"mobile" | "tablet" | "desktop">("mobile");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "publishing" | "error" | "success">("loading");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [message, setMessage] = useState("");
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [settingsPatches, setSettingsPatches] = useState<Record<string, Partial<BuilderSectionSettings>>>({});
  const [dirtyStateIds, setDirtyStateIds] = useState<Set<string>>(() => new Set());
  const [orderDirty, setOrderDirty] = useState(false);

  const selected = sections.find((section) => section.id === selectedId) ?? null;
  const orderedSections = useMemo(() => [...sections].sort((a, b) => a.sortOrder - b.sortOrder), [sections]);
  const activeSections = useMemo(() => orderedSections.filter((section) => section.isActive), [orderedSections]);
  const focusedSectionType = BUILDER_SECTION_TYPES.includes(requestedSectionType as BuilderSectionType)
    ? (requestedSectionType as BuilderSectionType)
    : null;
  const isFocusedSectionMode = Boolean(focusedSectionType);
  const isFocusedSectionMissing = Boolean(
    focusedSectionType && status !== "loading" && !orderedSections.some((section) => section.type === focusedSectionType)
  );

  function selectedRestaurantHeaders() {
    const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId);
    return {
      ...authHeaders(),
      ...(selectedRestaurant?.id ? { "x-restaurant-id": selectedRestaurant.id } : {})
    };
  }

  useEffect(() => {
    const session = getBrowserSession();
    const membershipRestaurants = session?.memberships.map((membership) => membership.restaurant) ?? [];

    async function loadRestaurants() {
      if (session?.user.role !== "SUPER_ADMIN") {
        setRestaurants(membershipRestaurants);
        setSelectedRestaurantId(requestedRestaurantId ?? membershipRestaurants[0]?.id ?? "");
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
        setSelectedRestaurantId(requestedRestaurantId ?? nextRestaurants[0]?.id ?? "");
      } catch {
        setRestaurants(membershipRestaurants);
        setSelectedRestaurantId(requestedRestaurantId ?? membershipRestaurants[0]?.id ?? "");
      }
    }

    void loadRestaurants();
  }, [requestedRestaurantId]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      return;
    }

    let mounted = true;

    async function loadBuilder() {
      setStatus("loading");
      setMessage("");

      try {
        const response = await fetch(`${API_URL}/dashboard/builder`, {
          headers: selectedRestaurantHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? "تعذر تحميل محرر الواجهة.");
        }

        const homePage = payload?.data?.pages?.find((page: any) => page.isHome) ?? payload?.data?.pages?.[0];
        const apiSections = homePage?.sections ?? [];
        const targetType = BUILDER_SECTION_TYPES.includes(requestedSectionType as BuilderSectionType)
          ? (requestedSectionType as BuilderSectionType)
          : null;

        if (mounted) {
          const normalizedSections = normalizeOrder(apiSections);
          const targetSection = targetType
            ? normalizedSections.find((section) => section.type === targetType)
            : null;
          setPageId(homePage?.id ?? "");
          setSections(normalizedSections);
          setSelectedId(targetType ? targetSection?.id ?? "" : normalizedSections[0]?.id ?? "");
          setSettingsPatches({});
          setDirtyStateIds(new Set());
          setOrderDirty(false);
          setStatus("idle");
        }
      } catch (error) {
        if (mounted) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "تعذر تحميل محرر الواجهة.");
        }
      }
    }

    void loadBuilder();

    return () => {
      mounted = false;
    };
  }, [selectedRestaurantId, restaurants, requestedSectionType]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setProducts([]);
      return;
    }

    let mounted = true;

    async function loadProducts() {
      try {
        const response = await fetch(`${API_URL}/dashboard/products?limit=100`, {
          headers: selectedRestaurantHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);
        const rows = (payload?.data?.data ?? payload?.data ?? payload ?? []) as ProductOption[];

        if (mounted) {
          setProducts(Array.isArray(rows) ? rows.map((item) => ({ id: item.id, name: item.name, slug: item.slug })) : []);
        }
      } catch {
        if (mounted) {
          setProducts([]);
        }
      }
    }

    void loadProducts();

    return () => {
      mounted = false;
    };
  }, [selectedRestaurantId, restaurants]);

  function selectSectionByType(type: BuilderSectionType) {
    const match = orderedSections.find((section) => section.type === type);
    if (match) {
      setSelectedId(match.id);
      return;
    }

    void addSection(type);
  }

  async function addSection(type: BuilderSectionType) {
    if (!pageId) {
      const section: BuilderSection = {
        id: `local-${Date.now()}`,
        type,
        sortOrder: sections.length,
        isActive: true,
        settings: defaultSectionSettings(type)
      };
      setSections((current) => normalizeOrder([...current, section]));
      setSelectedId(section.id);
      return;
    }

    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/builder/sections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...selectedRestaurantHeaders()
        },
        body: JSON.stringify({ pageId, type, sortOrder: sections.length })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر إضافة القسم.");
      }

      const section = payload.data as BuilderSection;
      setSections((current) => normalizeOrder([...current, section]));
      setSelectedId(section.id);
      setSettingsPatches((current) => {
        const next = { ...current };
        delete next[section.id];
        return next;
      });
      setDirtyStateIds((current) => {
        const next = new Set(current);
        next.delete(section.id);
        return next;
      });
      setStatus("success");
      setMessage("تمت إضافة القسم.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر إضافة القسم.");
    }
  }

  function markSettingsDirty(id: string, patch: Partial<BuilderSectionSettings>) {
    if (id.startsWith("local-")) return;
    setSettingsPatches((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {}),
        ...patch
      }
    }));
  }

  function markStateDirty(id: string) {
    if (id.startsWith("local-")) return;
    setDirtyStateIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  function updateSelected(partial: Partial<BuilderSection>, settingsPatch?: Partial<BuilderSectionSettings>) {
    if (!selected) return;
    if (settingsPatch) {
      markSettingsDirty(selected.id, settingsPatch);
    }
    if (typeof partial.isActive === "boolean") {
      markStateDirty(selected.id);
    }
    setSections((current) =>
      current.map((section) => (section.id === selected.id ? { ...section, ...partial } : section))
    );
  }

  function updateSetting<K extends keyof BuilderSectionSettings>(
    key: K,
    value: BuilderSectionSettings[K] | string | boolean
  ) {
    if (!selected) return;
    updateSelected({
      settings: {
        ...selected.settings,
        [key]: value
      }
    }, { [key]: value } as Partial<BuilderSectionSettings>);
  }

  function addAdBanner() {
    if (!selected) return;
    const adBanners = [
      ...(selected.settings.adBanners ?? []),
      {
        title: "Banner",
        subtitle: "",
        imageUrl: selected.settings.backgroundImageUrl ?? "",
        targetUrl: "/menu",
        targetProductId: "",
        badge: ""
      }
    ];
    updateSelected({
      settings: {
        ...selected.settings,
        adBanners
      }
    }, { adBanners });
  }

  function updateAdBanner(index: number, key: "title" | "subtitle" | "imageUrl" | "targetUrl" | "targetProductId" | "badge", value: string) {
    if (!selected) return;
    const adBanners = [...(selected.settings.adBanners ?? [])];
    adBanners[index] = { ...adBanners[index], [key]: value };
    updateSelected({
      settings: {
        ...selected.settings,
        adBanners
      }
    }, { adBanners });
  }

  function removeAdBanner(index: number) {
    if (!selected) return;
    const adBanners = (selected.settings.adBanners ?? []).filter((_, bannerIndex) => bannerIndex !== index);
    updateSelected({
      settings: {
        ...selected.settings,
        adBanners
      }
    }, { adBanners });
  }

  function addMoodItem() {
    if (!selected) return;
    const moodItems = [
      ...(selected.settings.moodItems ?? []),
      {
        label: "Mood",
        targetUrl: "/menu",
        iconX: 78,
        iconY: 50,
        iconWidth: 34,
        iconHeight: 34,
        color: "#d32f2f",
        backgroundType: "COLOR" as const
      }
    ];
    updateSelected({
      settings: {
        ...selected.settings,
        moodItems
      }
    }, { moodItems });
  }

  function updateMoodItem(
    index: number,
    key: "label" | "targetUrl" | "iconUrl" | "color" | "iconX" | "iconY" | "iconWidth" | "iconHeight" | "backgroundType" | "backgroundValue" | "backgroundCss" | "visualScrollEnabled",
    value: string | number | boolean
  ) {
    if (!selected) return;
    const moodItems = [...(selected.settings.moodItems ?? [])];
    moodItems[index] = { ...moodItems[index], [key]: value };
    updateSelected({
      settings: {
        ...selected.settings,
        moodItems
      }
    }, { moodItems });
  }

  function removeMoodItem(index: number) {
    if (!selected) return;
    const moodItems = (selected.settings.moodItems ?? []).filter((_, itemIndex) => itemIndex !== index);
    updateSelected({
      settings: {
        ...selected.settings,
        moodItems
      }
    }, { moodItems });
  }

  async function uploadBackgroundImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selected) return;

    setUploadingImage(true);
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "IMAGE");
      body.append("altText", selected.settings.title ?? file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: selectedRestaurantHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع الصورة.");
      }

      updateSetting("backgroundImageUrl", payload?.data?.url ?? payload?.url ?? "");
      setStatus("success");
      setMessage("تم رفع الصورة. اضغط حفظ لتثبيت التغيير.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الصورة.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  async function uploadAdBannerImage(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selected) return;

    setUploadingImage(true);
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "IMAGE");
      body.append("altText", selected.settings.adBanners?.[index]?.title ?? file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: selectedRestaurantHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع صورة البنر.");
      }

      updateAdBanner(index, "imageUrl", payload?.data?.url ?? payload?.url ?? "");
      setStatus("success");
      setMessage("تم رفع صورة البنر. اضغط حفظ لتثبيت التغيير.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع صورة البنر.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  async function uploadMoodIcon(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selected) return;

    setUploadingImage(true);
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "IMAGE");
      body.append("altText", selected.settings.moodItems?.[index]?.label ?? file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: selectedRestaurantHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع الأيقونة.");
      }

      updateMoodItem(index, "iconUrl", payload?.data?.url ?? payload?.url ?? "");
      setStatus("success");
      setMessage("تم رفع الأيقونة. اضغط حفظ لتثبيت التغيير.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الأيقونة.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  async function uploadMoodBackground(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selected) return;

    setUploadingImage(true);
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "IMAGE");
      body.append("altText", selected.settings.moodItems?.[index]?.label ?? file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: selectedRestaurantHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع الخلفية.");
      }

      updateMoodItem(index, "backgroundValue", payload?.data?.url ?? payload?.url ?? "");
      updateMoodItem(index, "backgroundType", "IMAGE");
      setStatus("success");
      setMessage("تم رفع الخلفية. اضغط حفظ لتثبيت التغيير.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الخلفية.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  function moveSelected(direction: -1 | 1) {
    if (!selected) return;
    const ordered = [...orderedSections];
    const index = ordered.findIndex((section) => section.id === selected.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;

    const [item] = ordered.splice(index, 1);
    ordered.splice(targetIndex, 0, item);
    setSections(normalizeOrder(ordered));
    setOrderDirty(true);
  }

  async function deleteSelected() {
    if (!selected) return;

    if (!selected.id.startsWith("local-")) {
      setStatus("saving");
      setMessage("");

      try {
        const response = await fetch(`${API_URL}/dashboard/builder/sections/${selected.id}`, {
          method: "DELETE",
          headers: selectedRestaurantHeaders()
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? "تعذر حذف القسم.");
        }
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "تعذر حذف القسم.");
        return;
      }
    }

    const next = sections.filter((section) => section.id !== selected.id);
    setSections(normalizeOrder(next));
    setSelectedId(next[0]?.id ?? "");
    setOrderDirty(true);
    setSettingsPatches((current) => {
      const nextPatches = { ...current };
      delete nextPatches[selected.id];
      return nextPatches;
    });
    setDirtyStateIds((current) => {
      const nextIds = new Set(current);
      nextIds.delete(selected.id);
      return nextIds;
    });
    setStatus("success");
    setMessage("تم حذف القسم.");
  }

  async function saveDraft() {
    setStatus("saving");
    setMessage("");

    try {
      const persistentSections = sections.filter((section) => !section.id.startsWith("local-"));
      const dirtyIds = new Set([...Object.keys(settingsPatches), ...dirtyStateIds]);
      const dirtySections = persistentSections.filter((section) => dirtyIds.has(section.id));

      await Promise.all(
        dirtySections.map((section) =>
          fetch(API_URL + "/dashboard/builder/sections/" + section.id, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...selectedRestaurantHeaders()
            },
            body: JSON.stringify({
              ...(settingsPatches[section.id] ? { settingsPatch: settingsPatches[section.id] } : {}),
              ...(dirtyStateIds.has(section.id) ? { isActive: section.isActive } : {})
            })
          }).then(async (response) => {
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(payload?.message ?? "Could not save section.");
            }
          })
        )
      );

      if (orderDirty) {
        const response = await fetch(API_URL + "/dashboard/builder/sections/reorder", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...selectedRestaurantHeaders()
          },
          body: JSON.stringify({
            sections: persistentSections.map((section) => ({
              id: section.id,
              sortOrder: section.sortOrder
            }))
          })
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? "Could not save section order.");
        }
      }

      setSettingsPatches({});
      setDirtyStateIds(new Set());
      setOrderDirty(false);
      setStatus("success");
      setMessage("Saved changes.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save.");
    }
  }

  async function publish() {
    setStatus("publishing");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/dashboard/builder/publish`, {
        method: "POST",
        headers: selectedRestaurantHeaders()
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "النشر يحتاج ميزة DRAFT_PUBLISH مفعلة في الباقة.");
      }

      setStatus("success");
      setMessage(`تم النشر بنجاح. النسخة ${payload?.data?.version ?? ""}`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر النشر.");
    }
  }

  return (
    <div className={`menu-builder-page${isFocusedSectionMode ? " focused-section-mode" : ""}`}>
      <section className="builder-top">
        <div>
          <span className="eyebrow">{isFocusedSectionMode ? "تحرير قسم" : "Menu Builder"}</span>
          <h1>{focusedSectionType ? SECTION_LABELS[focusedSectionType] : "منشئ الواجهة"}</h1>
          <p>
            {focusedSectionType === "MOOD_STRIP"
              ? "أضف وعدّل عناصر شو مزاجك اليوم، الأيقونات، الروابط، والألوان ثم احفظ التغييرات."
              : "رتب أقسام صفحة المنيو وعدل النصوص والصور ثم احفظ أو انشر النسخة."}
          </p>
          <p className="builder-quick-help">
            لإخفاء صفحات الأقسام اختر قسم "شبكة الأقسام". لرفع خلفية مزاج اختر قسم "شو مزاجك اليوم".
          </p>
        </div>
        <div className="builder-actions">
          <select value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
            <option value="">اختر المطعم</option>
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </select>
          <button onClick={saveDraft} disabled={status === "saving" || status === "loading"}>
            {status === "saving" ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            حفظ
          </button>
          <button className="publish" onClick={publish} disabled={status === "publishing" || status === "loading"}>
            {status === "publishing" ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            نشر
          </button>
        </div>
      </section>

      {message ? <p className={status === "success" ? "form-message success" : "form-message"}>{message}</p> : null}

      <section className="builder-workspace">
        <aside className="section-library">
          <h2>إضافة قسم</h2>
          <div className="builder-quick-links">
            <button type="button" onClick={() => selectSectionByType("CATEGORY_GRID")}>إعدادات صفحات الأقسام</button>
            <button type="button" onClick={() => selectSectionByType("FEATURED_PRODUCTS")}>كاردات الأصناف المميزة</button>
            <button type="button" onClick={() => selectSectionByType("PRODUCT_LIST")}>كاردات صفحة القائمة</button>
            <button type="button" onClick={() => selectSectionByType("MOOD_STRIP")}>خلفيات شو مزاجك اليوم</button>
          </div>
          <div>
            {BUILDER_SECTION_TYPES.map((type) => (
              <button key={type} type="button" onClick={() => void addSection(type)}>
                <Plus size={16} />
                {SECTION_LABELS[type]}
              </button>
            ))}
          </div>
        </aside>

        <section className="section-list-panel">
          <h2>ترتيب الصفحة</h2>
          <div className="section-list">
            {orderedSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={section.id === selected?.id ? "selected" : ""}
                onClick={() => setSelectedId(section.id)}
              >
                <span>{section.sortOrder + 1}</span>
                <b>{SECTION_LABELS[section.type]}</b>
                <small>{section.isActive ? "ظاهر" : "مخفي"}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="section-editor-panel">
          {status === "loading" ? (
            <SkeletonForm fields={7} />
          ) : null}

          {!selected && status !== "loading" ? (
            <div className="empty-state">
              <b>{isFocusedSectionMissing ? "Section not found" : "No sections"}</b>
              <p>
                {isFocusedSectionMissing
                  ? `${SECTION_LABELS[focusedSectionType!]} is not available. Add it manually if needed.`
                  : "Add a section to show it on the restaurant menu."}
              </p>
              {focusedSectionType ? (
                <button type="button" onClick={() => void addSection(focusedSectionType)}>
                  <Plus size={16} />
                  Add section
                </button>
              ) : null}
            </div>
          ) : null}

          {selected && status !== "loading" ? (
            <>
              <div className="section-editor-head">
                <div>
                  <h2>{SECTION_LABELS[selected.type]}</h2>
                  <span>{selected.type}</span>
                </div>
                <div>
                  <button type="button" onClick={() => moveSelected(-1)} aria-label="تحريك للأعلى">
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" onClick={() => moveSelected(1)} aria-label="تحريك للأسفل">
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelected({ isActive: !selected.isActive })}
                    aria-label="إظهار أو إخفاء"
                  >
                    {selected.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button className="danger" type="button" onClick={() => void deleteSelected()} aria-label="حذف">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="builder-fields">
                <label>
                  <span>العنوان</span>
                  <input
                    value={selected.settings.title ?? ""}
                    onChange={(event) => updateSetting("title", event.target.value)}
                  />
                </label>
                <label>
                  <span>العنوان الفرعي</span>
                  <input
                    value={selected.settings.subtitle ?? ""}
                    onChange={(event) => updateSetting("subtitle", event.target.value)}
                  />
                </label>
                <label className="full">
                  <span>الوصف</span>
                  <textarea
                    rows={4}
                    value={selected.settings.description ?? ""}
                    onChange={(event) => updateSetting("description", event.target.value)}
                  />
                </label>
                <label className="full">
                  <span>صورة الخلفية</span>
                  <input accept="image/*" disabled={uploadingImage} onChange={uploadBackgroundImage} type="file" />
                  <input
                    value={selected.settings.backgroundImageUrl ?? ""}
                    onChange={(event) => updateSetting("backgroundImageUrl", event.target.value)}
                  />
                </label>
                <label>
                  <span>نص الزر</span>
                  <input
                    value={selected.settings.buttonText ?? ""}
                    onChange={(event) => updateSetting("buttonText", event.target.value)}
                  />
                </label>
                <label>
                  <span>هدف الزر</span>
                  <input
                    value={selected.settings.buttonTarget ?? ""}
                    onChange={(event) => updateSetting("buttonTarget", event.target.value)}
                  />
                </label>
                {(selected.type === "FEATURED_PRODUCTS" || selected.type === "PRODUCT_LIST") ? (
                  <label>
                    <span>شكل كارد المنتجات</span>
                    <select value={selected.settings.cardVariant ?? ""} onChange={(event) => updateSetting("cardVariant", event.target.value)}>
                      <option value="">افتراضي</option>
                      {PRODUCT_CARD_VARIANTS.map((variant) => (
                        <option key={variant} value={variant}>{PRODUCT_CARD_VARIANT_LABELS[variant] ?? variant}</option>
                      ))}
                    </select>
                    <small className="settings-help">هذا الخيار يغيّر شكل كاردات هذا القسم فقط.</small>
                  </label>
                ) : null}
                {selected.type === "CATEGORY_GRID" ? (
                  <label>
                    <span>شكل أقسام القائمة</span>
                    <select value={selected.settings.categoryNavVariant ?? "image-chips"} onChange={(event) => updateSetting("categoryNavVariant", event.target.value)}>
                      {CATEGORY_NAV_VARIANTS.map((variant) => (
                        <option key={variant} value={variant}>{CATEGORY_NAV_VARIANT_LABELS[variant] ?? variant}</option>
                      ))}
                    </select>
                    <small className="settings-help">اختر النصوص فقط لقائمة Vertigo، أو الأقسام مع الصور للقالب الحالي.</small>
                  </label>
                ) : null}
                {selected.type === "CATEGORY_GRID" ? (
                  <div className="full builder-visibility-options">
                    <label className="builder-check">
                      <input
                        checked={selected.settings.showLandingCategories !== false}
                        onChange={(event) => updateSetting("showLandingCategories", event.target.checked)}
                        type="checkbox"
                      />
                      <span>إظهار صفحة الأقسام الأولى</span>
                    </label>
                    <label className="builder-check">
                      <input
                        checked={selected.settings.showNestedCategoryStrip !== false}
                        onChange={(event) => updateSetting("showNestedCategoryStrip", event.target.checked)}
                        type="checkbox"
                      />
                      <span>إظهار شريط الأقسام داخل صفحة المنتجات</span>
                    </label>
                  </div>
                ) : null}
                {selected.type === "HERO" ? (
                  <div className="full builder-ad-banners">
                    <div className="builder-mini-head">
                      <span>البنرات الإعلانية</span>
                      <button type="button" onClick={addAdBanner}>
                        <Plus size={15} />
                        إضافة بنر
                      </button>
                    </div>
                    {(selected.settings.adBanners ?? []).map((banner, index) => (
                      <article key={index} className="builder-ad-banner-item">
                        {banner.imageUrl ? <img src={banner.imageUrl} alt={banner.title || "بنر إعلاني"} /> : <span className="builder-banner-empty">لا توجد صورة</span>}
                        <label>
                          <span>صورة البنر</span>
                          <input accept="image/*" disabled={uploadingImage} onChange={(event) => uploadAdBannerImage(index, event)} type="file" />
                          <input value={banner.imageUrl ?? ""} onChange={(event) => updateAdBanner(index, "imageUrl", event.target.value)} />
                        </label>
                        <label>
                          <span>العنوان</span>
                          <input value={banner.title ?? ""} onChange={(event) => updateAdBanner(index, "title", event.target.value)} />
                        </label>
                        <label>
                          <span>الوصف</span>
                          <input value={banner.subtitle ?? ""} onChange={(event) => updateAdBanner(index, "subtitle", event.target.value)} />
                        </label>
                        <label>
                          <span>الشارة</span>
                          <input value={banner.badge ?? ""} onChange={(event) => updateAdBanner(index, "badge", event.target.value)} />
                        </label>
                        <label>
                          <span>الوجبة المستهدفة</span>
                          <select value={banner.targetProductId ?? ""} onChange={(event) => updateAdBanner(index, "targetProductId", event.target.value)}>
                            <option value="">بدون اختيار</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>الرابط</span>
                          <input value={banner.targetUrl ?? ""} onChange={(event) => updateAdBanner(index, "targetUrl", event.target.value)} />
                        </label>
                        <button className="danger" type="button" onClick={() => removeAdBanner(index)} aria-label="حذف البنر">
                          <Trash2 size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}
                {selected.type === "MOOD_STRIP" ? (
                  <div className="full builder-mood-items">
                    <div className="builder-mini-head">
                      <span>عناصر شو مزاجك اليوم</span>
                      <button type="button" onClick={addMoodItem}>
                        <Plus size={15} />
                        إضافة عنصر
                      </button>
                    </div>
                    {(selected.settings.moodItems ?? []).map((item, index) => (
                      <article key={index} className="builder-mood-item">
                        <div
                          className={`builder-mood-item-preview ${item.visualScrollEnabled ? "visual-scroll" : ""}`}
                          style={{
                            ...moodBackgroundStyle(item),
                            "--icon-x": `${item.iconX ?? 78}%`,
                            "--icon-y": `${item.iconY ?? 50}%`,
                            "--icon-width": `${item.iconWidth ?? 34}px`,
                            "--icon-height": `${item.iconHeight ?? 34}px`
                          } as React.CSSProperties}
                        >
                          {item.iconUrl ? <img src={item.iconUrl} alt="" /> : null}
                          <span>{item.label || "مزاج جديد"}</span>
                        </div>
                        <label>
                          <span>النص</span>
                          <input value={item.label} onChange={(event) => updateMoodItem(index, "label", event.target.value)} />
                        </label>
                        <label>
                          <span>الرابط</span>
                          <input value={item.targetUrl ?? ""} onChange={(event) => updateMoodItem(index, "targetUrl", event.target.value)} />
                        </label>
                        <label>
                          <span>رابط الأيقونة</span>
                          <input accept="image/*" disabled={uploadingImage} onChange={(event) => uploadMoodIcon(index, event)} type="file" />
                          <input value={item.iconUrl ?? ""} onChange={(event) => updateMoodItem(index, "iconUrl", event.target.value)} />
                        </label>
                        <label>
                          <span>اللون</span>
                          <input type="color" value={item.color ?? "#d32f2f"} onChange={(event) => updateMoodItem(index, "color", event.target.value)} />
                        </label>
                        <label>
                          <span>نوع الخلفية</span>
                          <select value={item.backgroundType ?? "COLOR"} onChange={(event) => updateMoodItem(index, "backgroundType", event.target.value as MoodBackgroundType)}>
                            <option value="COLOR">لون</option>
                            <option value="IMAGE">صورة</option>
                            <option value="TEXTURE">تكستشر</option>
                            <option value="PATTERN">نقشة</option>
                            <option value="GRADIENT">تدرج</option>
                          </select>
                        </label>
                        <label>
                          <span>رفع صورة خلفية المزاج</span>
                          <input accept="image/*" disabled={uploadingImage} onChange={(event) => uploadMoodBackground(index, event)} type="file" />
                        </label>
                        <label>
                          <span>رابط/لون الخلفية</span>
                          <input value={item.backgroundValue ?? ""} onChange={(event) => updateMoodItem(index, "backgroundValue", event.target.value)} placeholder="#d32f2f أو رابط صورة أو gradient" />
                        </label>
                        <label>
                          <span>CSS خلفية</span>
                          <input value={item.backgroundCss ?? ""} onChange={(event) => updateMoodItem(index, "backgroundCss", event.target.value)} placeholder="linear-gradient(...) أو repeating-linear-gradient(...)" />
                        </label>
                        <label className="builder-check">
                          <input checked={item.visualScrollEnabled ?? false} onChange={(event) => updateMoodItem(index, "visualScrollEnabled", event.target.checked)} type="checkbox" />
                          <span>سكرول/نقشة وهمية</span>
                        </label>
                        <label>
                          <span>X: {item.iconX ?? 78}%</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={item.iconX ?? 78}
                            onChange={(event) => updateMoodItem(index, "iconX", Number(event.target.value))}
                          />
                        </label>
                        <label>
                          <span>Y: {item.iconY ?? 50}%</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={item.iconY ?? 50}
                            onChange={(event) => updateMoodItem(index, "iconY", Number(event.target.value))}
                          />
                        </label>
                        <label>
                          <span>عرض الأيقونة</span>
                          <input
                            type="number"
                            min="12"
                            max="140"
                            value={item.iconWidth ?? 34}
                            onChange={(event) => updateMoodItem(index, "iconWidth", Number(event.target.value))}
                          />
                        </label>
                        <label>
                          <span>ارتفاع الأيقونة</span>
                          <input
                            type="number"
                            min="12"
                            max="140"
                            value={item.iconHeight ?? 34}
                            onChange={(event) => updateMoodItem(index, "iconHeight", Number(event.target.value))}
                          />
                        </label>
                        <button className="danger" type="button" onClick={() => removeMoodItem(index)} aria-label="حذف العنصر">
                          <Trash2 size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        <aside className="builder-preview-panel">
          <div className="device-switch">
            {(["mobile", "tablet", "desktop"] as const).map((mode) => (
              <button key={mode} type="button" className={device === mode ? "active" : ""} onClick={() => setDevice(mode)}>
                {mode}
              </button>
            ))}
          </div>
          <div className={`builder-preview ${device}`}>
            {activeSections.map((section) => (
              <PreviewSection key={section.id} section={section} />
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function PreviewSection({ section }: { section: BuilderSection }) {
  if (section.type === "HERO") {
    return (
      <article className="preview-section hero">
        {section.settings.backgroundImageUrl ? (
          <img src={section.settings.backgroundImageUrl} alt={section.settings.title ?? "Hero"} />
        ) : null}
        <div>
          <h2>{section.settings.title}</h2>
          <p>{section.settings.subtitle}</p>
          {section.settings.buttonText ? <span>{section.settings.buttonText}</span> : null}
        </div>
      </article>
    );
  }

  if (section.type === "CATEGORY_GRID") {
    return (
      <article className="preview-section chips">
        <h2>{section.settings.title ?? "الأقسام"}</h2>
        <div>
          {["برغر", "شاورما", "مقبلات"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </article>
    );
  }

  if (section.type === "MOOD_STRIP") {
    return (
      <article className="preview-section chips">
        <h2>{section.settings.title ?? "شو مزاجك اليوم؟"}</h2>
        <div>
          {(section.settings.moodItems ?? []).map((item, index) => (
            <span key={`${item.label}-${index}`} style={{ ...moodBackgroundStyle(item), color: "white" }}>
              {item.iconUrl && (item.iconPosition === "start" || item.iconPosition === "top") ? <ImageIcon size={16} /> : null}
              {item.label}
              {item.iconUrl && (item.iconPosition === "end" || item.iconPosition === "bottom") ? <ImageIcon size={16} /> : null}
            </span>
          ))}
        </div>
      </article>
    );
  }

  if (section.type === "FEATURED_PRODUCTS" || section.type === "PRODUCT_LIST") {
    return (
      <article className="preview-section products">
        <h2>{section.settings.title ?? SECTION_LABELS[section.type]}</h2>
        <div>
          {["كرانشي برغر", "وجبة بانيه", "زلزال تشكن"].map((item) => (
            <span key={item}>
              <ImageIcon size={16} />
              {item}
            </span>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className="preview-section text">
      <h2>{section.settings.title ?? SECTION_LABELS[section.type]}</h2>
      <p>{section.settings.description ?? "محتوى القسم يظهر هنا."}</p>
    </article>
  );
}

function normalizeOrder(items: BuilderSection[]) {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}
