"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Beef,
  Clock3,
  Drumstick,
  Flame,
  Heart,
  ImagePlus,
  Plus,
  Save,
  Scale,
  Sparkles,
  Star,
  Trash2,
  Utensils,
  Wheat,
  ArrowRight,
  Loader2,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { authHeaders, getBrowserSession, resolveStoredRestaurant, setStoredRestaurant } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type FormState = {
  name: string;
  categoryId: string;
  description: string;
  basePrice: string;
  currency: string;
  imageUrl: string;
  imageUrls: string[];
  moodKeys: string[];
  ingredients: IngredientFormItem[];
  mealDetails: MealDetailFormItem[];
  model3dUrl: string;
  model3dFormat: string;
  vrUrl: string;
  isNew: boolean;
  isPopular: boolean;
};

type IngredientFormItem = {
  name: string;
  imageUrl: string;
};

type IngredientSuggestion = IngredientFormItem & {
  usageCount: number;
};

type MealDetailFormItem = {
  label: string;
  value: string;
  icon: string;
  iconUrl?: string;
};

type MealDetailSuggestion = MealDetailFormItem & {
  usageCount: number;
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

const DETAIL_ICON_OPTIONS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "scale", label: "وزن", icon: Scale },
  { key: "drumstick", label: "دجاج", icon: Drumstick },
  { key: "beef", label: "لحم", icon: Beef },
  { key: "wheat", label: "خبز", icon: Wheat },
  { key: "flame", label: "حدة", icon: Flame },
  { key: "utensils", label: "وجبة", icon: Utensils },
  { key: "clock", label: "وقت", icon: Clock3 },
  { key: "star", label: "مميز", icon: Star },
  { key: "heart", label: "مفضل", icon: Heart },
  { key: "sparkles", label: "خاص", icon: Sparkles }
];

const DEFAULT_MEAL_DETAILS: MealDetailFormItem[] = [
  { label: "الوزن التقريبي", value: "", icon: "scale" },
  { label: "نوع البروتين", value: "", icon: "drumstick" },
  { label: "نوع الخبز", value: "", icon: "wheat" },
  { label: "مستوى الحدة", value: "", icon: "flame" }
];

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
  moodKeys?: string[];
  ingredients?: Array<string | { name?: string; imageUrl?: string | null }>;
  nutrition?: {
    details?: MealDetailFormItem[];
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
  images?: Array<{ id?: string; url: string; altText?: string | null }>;
};

function normalizeIngredients(items?: Array<string | { name?: string; imageUrl?: string | null }>): IngredientFormItem[] {
  return (items ?? [])
    .map((item) =>
      typeof item === "string"
        ? { name: item.trim(), imageUrl: "" }
        : { name: item.name?.trim() ?? "", imageUrl: item.imageUrl ?? "" }
    )
    .filter((item) => item.name || item.imageUrl);
}

function normalizeMealDetails(nutrition?: ProductDetails["nutrition"]): MealDetailFormItem[] {
  if (Array.isArray(nutrition?.details)) {
    const details = nutrition.details
      .map((item) => ({
        label: item.label?.trim() ?? "",
        value: item.value?.trim() ?? "",
        icon: DETAIL_ICON_OPTIONS.some((option) => option.key === item.icon) ? item.icon : "utensils",
        iconUrl: item.iconUrl?.trim() ?? ""
      }))
      .filter((item) => item.label || item.value);

    return details.length ? details : [];
  }

  const legacyDetails = [
    { ...DEFAULT_MEAL_DETAILS[0], value: nutrition?.weight ?? "" },
    { ...DEFAULT_MEAL_DETAILS[1], value: nutrition?.protein ?? "" },
    { ...DEFAULT_MEAL_DETAILS[2], value: nutrition?.breadType ?? "" },
    { ...DEFAULT_MEAL_DETAILS[3], value: nutrition?.spice ?? "" }
  ];

  return legacyDetails;
}

function detailIconComponent(iconKey: string) {
  return DETAIL_ICON_OPTIONS.find((option) => option.key === iconKey)?.icon ?? Utensils;
}

function normalizeMoodKeys(items?: string[] | string | null): string[] {
  const source = Array.isArray(items) ? items : items ? parseStoredMoodKeys(items) : [];
  const seen = new Set<string>();

  return source
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseStoredMoodKeys(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return [value];
  }

  return [value];
}

function ingredientKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function mealDetailKey(detail: Pick<MealDetailFormItem, "label" | "value" | "icon" | "iconUrl">) {
  return `${detail.label.trim().toLocaleLowerCase()}|${detail.value.trim().toLocaleLowerCase()}|${detail.icon}|${detail.iconUrl?.trim().toLocaleLowerCase() ?? ""}`;
}

function emptyProductForm(): FormState {
  return {
    name: "",
    categoryId: "",
    description: "",
    basePrice: "",
    currency: "ل.س",
    imageUrl: "",
    imageUrls: [],
    moodKeys: [],
    ingredients: [],
    mealDetails: DEFAULT_MEAL_DETAILS.map((detail) => ({ ...detail })),
    model3dUrl: "",
    model3dFormat: "GLB",
    vrUrl: "",
    isNew: false,
    isPopular: false
  };
}

function normalizedProductImageUrls(urls: string[]) {
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
}

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [modelUploadStatus, setModelUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [selectedRestaurantName, setSelectedRestaurantName] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [moodOptions, setMoodOptions] = useState<MoodOption[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<IngredientSuggestion[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [ingredientLibraryStatus, setIngredientLibraryStatus] = useState<"idle" | "loading" | "error">("idle");
  const [mealDetailSuggestions, setMealDetailSuggestions] = useState<MealDetailSuggestion[]>([]);
  const [mealDetailSearch, setMealDetailSearch] = useState("");
  const [mealDetailLibraryStatus, setMealDetailLibraryStatus] = useState<"idle" | "loading" | "error">("idle");
  const [detailIconSearch, setDetailIconSearch] = useState("");
  const [form, setForm] = useState<FormState>(() => emptyProductForm());

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setProductImages(urls: string[]) {
    const uniqueUrls = normalizedProductImageUrls(urls);
    setForm((current) => ({
      ...current,
      imageUrl: uniqueUrls[0] ?? "",
      imageUrls: uniqueUrls
    }));
  }

  function setPrimaryImage(url: string) {
    setForm((current) => {
      const nextUrl = url.trim();
      const rest = current.imageUrls.filter((item, index) => index > 0 && item !== nextUrl);
      const imageUrls = nextUrl ? [nextUrl, ...rest] : rest;
      return { ...current, imageUrl: nextUrl, imageUrls };
    });
  }

  function addProductImageUrl(url = "") {
    setForm((current) => ({ ...current, imageUrls: [...current.imageUrls, url] }));
  }

  function updateProductImageUrl(index: number, url: string) {
    setForm((current) => {
      const imageUrls = current.imageUrls.map((item, itemIndex) => (itemIndex === index ? url : item));
      return {
        ...current,
        imageUrl: imageUrls[0]?.trim() ?? "",
        imageUrls
      };
    });
  }

  function removeProductImage(index: number) {
    setForm((current) => {
      const imageUrls = current.imageUrls.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        imageUrl: imageUrls[0]?.trim() ?? "",
        imageUrls
      };
    });
  }

  function moveProductImage(index: number, direction: -1 | 1) {
    setForm((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.imageUrls.length) return current;
      const imageUrls = [...current.imageUrls];
      [imageUrls[index], imageUrls[target]] = [imageUrls[target], imageUrls[index]];
      return {
        ...current,
        imageUrl: imageUrls[0]?.trim() ?? "",
        imageUrls
      };
    });
  }

  function addIngredient(ingredient: IngredientFormItem = { name: "", imageUrl: "" }) {
    setForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, ingredient]
    }));
  }

  function addExistingIngredient(ingredient: IngredientFormItem) {
    setForm((current) => {
      const nextKey = ingredientKey(ingredient.name);
      if (nextKey && current.ingredients.some((item) => ingredientKey(item.name) === nextKey)) {
        return current;
      }

      return {
        ...current,
        ingredients: [...current.ingredients, { name: ingredient.name, imageUrl: ingredient.imageUrl }]
      };
    });
    setIngredientSearch("");
  }

  function updateIngredient(index: number, patch: Partial<IngredientFormItem>) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, itemIndex) =>
        itemIndex === index ? { ...ingredient, ...patch } : ingredient
      )
    }));
  }

  function removeIngredient(index: number) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function addMealDetail() {
    setForm((current) => ({
      ...current,
      mealDetails: [...current.mealDetails, { label: "", value: "", icon: "utensils", iconUrl: "" }]
    }));
  }

  function addExistingMealDetail(detail: MealDetailFormItem) {
    setForm((current) => {
      const nextKey = mealDetailKey(detail);
      if (current.mealDetails.some((item) => mealDetailKey(item) === nextKey)) {
        return current;
      }

      return {
        ...current,
        mealDetails: [...current.mealDetails, { label: detail.label, value: detail.value, icon: detail.icon, iconUrl: detail.iconUrl ?? "" }]
      };
    });
    setMealDetailSearch("");
  }

  function updateMealDetail(index: number, patch: Partial<MealDetailFormItem>) {
    setForm((current) => ({
      ...current,
      mealDetails: current.mealDetails.map((detail, itemIndex) =>
        itemIndex === index ? { ...detail, ...patch } : detail
      )
    }));
  }

  function removeMealDetail(index: number) {
    setForm((current) => ({
      ...current,
      mealDetails: current.mealDetails.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function toggleMoodKey(key: string) {
    setForm((current) => {
      const exists = current.moodKeys.includes(key);
      return {
        ...current,
        moodKeys: exists ? current.moodKeys.filter((item) => item !== key) : [...current.moodKeys, key]
      };
    });
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
    setIsSuperAdmin(session?.user.role === "SUPER_ADMIN");
    const membershipRestaurants =
      session?.memberships.map((membership) => membership.restaurant) ?? [];
    const queryRestaurantId = new URLSearchParams(window.location.search).get("restaurantId");
    const queryRestaurantSlug = new URLSearchParams(window.location.search).get("restaurantSlug");
    const queryRestaurantName = new URLSearchParams(window.location.search).get("restaurantName") ?? undefined;
    const storedRestaurant = resolveStoredRestaurant(session);

    if (queryRestaurantId && queryRestaurantSlug && setStoredRestaurant({ id: queryRestaurantId, slug: queryRestaurantSlug, name: queryRestaurantName })) {
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
    if (!selectedRestaurantId) {
      setIngredientSuggestions([]);
      setIngredientLibraryStatus("idle");
      return;
    }

    let cancelled = false;

    async function loadIngredientSuggestions() {
      setIngredientLibraryStatus("loading");
      try {
        const response = await fetch(`${API_URL}/dashboard/products/ingredients`, {
          headers: selectedRestaurantHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error("Unable to load ingredients");
        }

        const body = payload?.data ?? payload ?? [];
        const nextSuggestions = (Array.isArray(body) ? body : body.data ?? []) as IngredientSuggestion[];
        if (!cancelled) {
          setIngredientSuggestions(
            nextSuggestions
              .map((item) => ({
                name: item.name?.trim() ?? "",
                imageUrl: item.imageUrl ?? "",
                usageCount: Number(item.usageCount ?? 0)
              }))
              .filter((item) => item.name)
          );
          setIngredientLibraryStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setIngredientSuggestions([]);
          setIngredientLibraryStatus("error");
        }
      }
    }

    void loadIngredientSuggestions();

    return () => {
      cancelled = true;
    };
  }, [selectedRestaurantId, restaurants]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setMealDetailSuggestions([]);
      setMealDetailLibraryStatus("idle");
      return;
    }

    let cancelled = false;

    async function loadMealDetailSuggestions() {
      setMealDetailLibraryStatus("loading");
      try {
        const response = await fetch(`${API_URL}/dashboard/products/meal-details`, {
          headers: selectedRestaurantHeaders(),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error("Unable to load meal details");
        }

        const body = payload?.data ?? payload ?? [];
        const nextSuggestions = (Array.isArray(body) ? body : body.data ?? []) as MealDetailSuggestion[];
        if (!cancelled) {
          setMealDetailSuggestions(
            nextSuggestions
              .map((item) => ({
                label: item.label?.trim() ?? "",
                value: item.value?.trim() ?? "",
                icon: DETAIL_ICON_OPTIONS.some((option) => option.key === item.icon) ? item.icon : "utensils",
                iconUrl: item.iconUrl?.trim() ?? "",
                usageCount: Number(item.usageCount ?? 0)
              }))
              .filter((item) => item.label || item.value)
          );
          setMealDetailLibraryStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setMealDetailSuggestions([]);
          setMealDetailLibraryStatus("error");
        }
      }
    }

    void loadMealDetailSuggestions();

    return () => {
      cancelled = true;
    };
  }, [selectedRestaurantId, restaurants]);

  useEffect(() => {
    if (productId) {
      return;
    }

    setForm(emptyProductForm());
    setStatus("idle");
    setUploadStatus("idle");
    setModelUploadStatus("idle");
    setMessage("");
  }, [productId]);

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
        const imageUrls = product.images?.map((image) => image.url).filter(Boolean) ?? [];
        setForm({
          name: product.name ?? "",
          categoryId: product.category?.id ?? "",
          description: product.description ?? "",
          basePrice: String(product.basePrice ?? ""),
          currency: product.currency ?? "ل.س",
          imageUrl: imageUrls[0] ?? "",
          imageUrls,
          moodKeys: normalizeMoodKeys(product.moodKeys?.length ? product.moodKeys : product.moodKey),
          ingredients: normalizeIngredients(product.ingredients),
          mealDetails: normalizeMealDetails(product.nutrition),
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
      const productImageUrls = normalizedProductImageUrls(form.imageUrls);
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
          moodKey: form.moodKeys[0] || undefined,
          moodKeys: form.moodKeys,
          imageUrl: productImageUrls[0] || undefined,
          images: productImageUrls.map((url, index) => ({
            url,
            altText: index === 0 ? form.name : `${form.name} ${index + 1}`
          })),
          ingredients: form.ingredients
            .map((item) => ({
              name: item.name.trim(),
              imageUrl: item.imageUrl.trim() || undefined
            }))
            .filter((item) => item.name || item.imageUrl),
          nutrition: {
            details: form.mealDetails
              .map((item) => ({
                label: item.label.trim(),
                value: item.value.trim(),
                icon: item.icon,
                iconUrl: item.iconUrl?.trim() || undefined
              }))
              .filter((item) => item.label || item.value)
          },
          ...(isSuperAdmin
            ? {
                model3dUrl: form.model3dUrl,
                model3dFormat: form.model3dFormat,
                vrUrl: form.vrUrl,
                vrType: form.vrUrl ? "PANORAMA" : ""
              }
            : {}),
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

      setPrimaryImage(payload?.data?.url ?? payload?.url ?? "");
      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الصورة.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleGalleryImagesUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setUploadStatus("uploading");
    setMessage("");

    try {
      const uploadedUrls: string[] = [];

      for (const file of files) {
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
          throw new Error(payload?.message ?? "تعذر رفع إحدى الصور.");
        }

        const url = payload?.data?.url ?? payload?.url;
        if (url) uploadedUrls.push(url);
      }

      setProductImages([...form.imageUrls, ...uploadedUrls]);
      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الصور.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleIngredientImageUpload(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadStatus("uploading");
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "IMAGE");
      body.append("altText", form.ingredients[index]?.name || form.name || file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: selectedRestaurantHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع صورة المكون.");
      }

      updateIngredient(index, { imageUrl: payload?.data?.url ?? payload?.url ?? "" });
      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع صورة المكون.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleMealDetailIconUpload(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadStatus("uploading");
    setMessage("");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "PNG_ICON");
      body.append("altText", form.mealDetails[index]?.label || form.name || file.name);

      const response = await fetch(`${API_URL}/dashboard/media/upload`, {
        method: "POST",
        headers: selectedRestaurantHeaders(),
        body
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "تعذر رفع أيقونة التفصيل.");
      }

      updateMealDetail(index, { iconUrl: payload?.data?.url ?? payload?.url ?? "" });
      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع أيقونة التفصيل.");
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

  const productGalleryUrls = form.imageUrls;
  const selectedIngredientKeys = useMemo(
    () => new Set(form.ingredients.map((ingredient) => ingredientKey(ingredient.name)).filter(Boolean)),
    [form.ingredients]
  );
  const filteredIngredientSuggestions = useMemo(() => {
    const query = ingredientKey(ingredientSearch);

    return ingredientSuggestions
      .filter((ingredient) => {
        const key = ingredientKey(ingredient.name);
        return key && !selectedIngredientKeys.has(key) && (!query || key.includes(query));
      })
      .slice(0, 8);
  }, [ingredientSearch, ingredientSuggestions, selectedIngredientKeys]);
  const searchedIngredientName = ingredientSearch.trim();
  const searchedIngredientKey = ingredientKey(searchedIngredientName);
  const canAddSearchedIngredient =
    Boolean(searchedIngredientKey) &&
    !selectedIngredientKeys.has(searchedIngredientKey) &&
    !ingredientSuggestions.some((ingredient) => ingredientKey(ingredient.name) === searchedIngredientKey);
  const selectedMealDetailKeys = useMemo(
    () => new Set(form.mealDetails.map((detail) => mealDetailKey(detail)).filter((key) => key !== "||")),
    [form.mealDetails]
  );
  const filteredMealDetailSuggestions = useMemo(() => {
    const query = mealDetailSearch.trim().toLocaleLowerCase();

    return mealDetailSuggestions
      .filter((detail) => {
        const key = mealDetailKey(detail);
        const searchable = `${detail.label} ${detail.value} ${detail.icon}`.toLocaleLowerCase();
        return key !== "||" && !selectedMealDetailKeys.has(key) && (!query || searchable.includes(query));
      })
      .slice(0, 8);
  }, [mealDetailSearch, mealDetailSuggestions, selectedMealDetailKeys]);
  const filteredDetailIconOptions = useMemo(() => {
    const query = detailIconSearch.trim().toLocaleLowerCase();

    return DETAIL_ICON_OPTIONS.filter((option) => {
      const searchable = `${option.key} ${option.label}`.toLocaleLowerCase();
      return !query || searchable.includes(query);
    });
  }, [detailIconSearch]);

  return (
    <form className={`product-form-page ${isSuperAdmin ? "" : "owner-product-form"}`} onSubmit={handleSubmit}>
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

          <fieldset className="product-mood-picker">
            <legend>شو مزاجك اليوم</legend>
            {moodOptions.length ? (
              <div className="product-mood-options">
                {moodOptions.map((mood) => (
                  <button
                    key={mood.key}
                    type="button"
                    className={`product-mood-chip ${form.moodKeys.includes(mood.key) ? "selected" : ""}`}
                    onClick={() => toggleMoodKey(mood.key)}
                    aria-pressed={form.moodKeys.includes(mood.key)}
                  >
                    <span className="product-mood-chip-mark" aria-hidden="true" />
                    <span>{mood.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <span className="product-mood-empty">لا توجد خيارات مزاج مفعلة في الـ builder.</span>
            )}
          </fieldset>

          <label className="full">
            <span>الوصف</span>
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              rows={4}
            />
          </label>

          <div className="product-ingredients-editor full">
            <div className="field-row-head">
              <span>مكونات الوجبة</span>
              <button type="button" onClick={() => addIngredient()}>
                <Plus size={16} />
                إضافة مكون
              </button>
            </div>
            <div className="ingredient-library-picker">
              <label className="ingredient-search-field">
                <span>إضافة مكون موجود</span>
                <input
                  value={ingredientSearch}
                  onChange={(event) => setIngredientSearch(event.target.value)}
                  placeholder="ابحث عن مكون محفوظ..."
                />
              </label>
              {ingredientSearch || filteredIngredientSuggestions.length || ingredientLibraryStatus !== "idle" ? (
                <div className="ingredient-suggestion-list">
                  {ingredientLibraryStatus === "loading" ? <span className="ingredient-suggestion-note">جاري تحميل المكونات...</span> : null}
                  {ingredientLibraryStatus === "error" ? <span className="ingredient-suggestion-note">تعذر تحميل المكونات الحالية.</span> : null}
                  {filteredIngredientSuggestions.map((ingredient) => (
                    <button
                      key={ingredientKey(ingredient.name)}
                      type="button"
                      className="ingredient-suggestion"
                      onClick={() => addExistingIngredient(ingredient)}
                    >
                      {ingredient.imageUrl ? <img src={ingredient.imageUrl} alt={ingredient.name} /> : <span className="ingredient-suggestion-image" />}
                      <span>{ingredient.name}</span>
                      <small>{ingredient.usageCount}x</small>
                    </button>
                  ))}
                  {canAddSearchedIngredient ? (
                    <button
                      type="button"
                      className="ingredient-suggestion ingredient-suggestion-create"
                      onClick={() => addExistingIngredient({ name: searchedIngredientName, imageUrl: "" })}
                    >
                      <Plus size={16} />
                      <span>إضافة "{searchedIngredientName}" كمكون جديد</span>
                    </button>
                  ) : null}
                  {ingredientSearch && !filteredIngredientSuggestions.length && !canAddSearchedIngredient && ingredientLibraryStatus === "idle" ? (
                    <span className="ingredient-suggestion-note">لا يوجد مكون مطابق أو تمت إضافته مسبقاً.</span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {form.ingredients.length ? (
              <div className="ingredient-form-list">
                {form.ingredients.map((ingredient, index) => (
                  <div className="ingredient-form-row" key={`ingredient-${index}`}>
                    {ingredient.imageUrl ? <img src={ingredient.imageUrl} alt={ingredient.name || "مكون"} /> : <span className="ingredient-image-placeholder" />}
                    <label>
                      <span>اسم المكون</span>
                      <input
                        value={ingredient.name}
                        onChange={(event) => updateIngredient(index, { name: event.target.value })}
                        placeholder="بطاطا"
                      />
                    </label>
                    <label>
                      <span>صورة اختيارية</span>
                      <input
                        accept="image/*"
                        disabled={!selectedRestaurantId || uploadStatus === "uploading"}
                        onChange={(event) => handleIngredientImageUpload(index, event)}
                        type="file"
                      />
                    </label>
                    <label className="ingredient-url-field">
                      <span>رابط الصورة</span>
                      <input
                        value={ingredient.imageUrl}
                        onChange={(event) => updateIngredient(index, { imageUrl: event.target.value })}
                        placeholder="https://..."
                      />
                    </label>
                    <button type="button" className="ingredient-remove" onClick={() => removeIngredient(index)} aria-label="حذف المكون">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" className="ingredient-empty-add" onClick={() => addIngredient()}>
                <Plus size={16} />
                إضافة أول مكون
              </button>
            )}
          </div>

          <label>
            <span>السعر</span>
            <input
              className="no-number-spin"
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

          <section className="meal-details-editor full">
            <div className="field-row-head">
              <span>تفاصيل الوجبة</span>
              <button type="button" onClick={addMealDetail}>
                <Plus size={16} />
                إضافة تفصيل
              </button>
            </div>
            <div className="meal-detail-library-picker">
              <label className="ingredient-search-field">
                <span>بحث في التفاصيل المحفوظة</span>
                <input
                  value={mealDetailSearch}
                  onChange={(event) => setMealDetailSearch(event.target.value)}
                  placeholder="ابحث باسم التفصيل أو قيمته..."
                />
              </label>
              {mealDetailSearch || filteredMealDetailSuggestions.length || mealDetailLibraryStatus !== "idle" ? (
                <div className="meal-detail-suggestion-list">
                  {mealDetailLibraryStatus === "loading" ? <span className="ingredient-suggestion-note">جاري تحميل التفاصيل...</span> : null}
                  {mealDetailLibraryStatus === "error" ? <span className="ingredient-suggestion-note">تعذر تحميل التفاصيل المحفوظة.</span> : null}
                  {filteredMealDetailSuggestions.map((detail) => {
                    const DetailIcon = detailIconComponent(detail.icon);

                    return (
                      <button
                        key={mealDetailKey(detail)}
                        type="button"
                        className="meal-detail-suggestion"
                        onClick={() => addExistingMealDetail(detail)}
                      >
                        {detail.iconUrl ? <img src={detail.iconUrl} alt="" /> : <DetailIcon size={16} />}
                        <span>{detail.label}</span>
                        {detail.value ? <b>{detail.value}</b> : null}
                        <small>{detail.usageCount}x</small>
                      </button>
                    );
                  })}
                  {mealDetailSearch && !filteredMealDetailSuggestions.length && mealDetailLibraryStatus === "idle" ? (
                    <span className="ingredient-suggestion-note">لا يوجد تفصيل مطابق أو تمت إضافته مسبقاً.</span>
                  ) : null}
                </div>
              ) : null}
              <label className="ingredient-search-field">
                <span>بحث في مكتبة الأيقونات</span>
                <input
                  value={detailIconSearch}
                  onChange={(event) => setDetailIconSearch(event.target.value)}
                  placeholder="مثال: وزن، لحم، وقت..."
                />
              </label>
            </div>
            {form.mealDetails.length ? (
              <div className="meal-detail-form-list">
                {form.mealDetails.map((detail, index) => {
                  const DetailIcon = detailIconComponent(detail.icon);

                  return (
                    <div className="meal-detail-form-row" key={`meal-detail-${index}`}>
                      <span className="meal-detail-icon-preview" aria-hidden="true">
                        {detail.iconUrl ? <img src={detail.iconUrl} alt="" /> : <DetailIcon size={18} />}
                      </span>
                      <label>
                        <span>اسم التفصيل</span>
                        <input
                          value={detail.label}
                          onChange={(event) => updateMealDetail(index, { label: event.target.value })}
                          placeholder="الوزن التقريبي"
                        />
                      </label>
                      <label>
                        <span>القيمة</span>
                        <input
                          value={detail.value}
                          onChange={(event) => updateMealDetail(index, { value: event.target.value })}
                          placeholder="350 غ"
                        />
                      </label>
                      <div className="meal-detail-icon-library">
                        <span>الأيقونة</span>
                        <div>
                          {filteredDetailIconOptions.map((option) => {
                            const Icon = option.icon;

                            return (
                              <button
                                key={option.key}
                                type="button"
                                className={detail.icon === option.key ? "selected" : ""}
                                onClick={() => updateMealDetail(index, { icon: option.key, iconUrl: "" })}
                                title={option.label}
                                aria-label={option.label}
                              >
                                <Icon size={16} />
                              </button>
                            );
                          })}
                          {!filteredDetailIconOptions.length ? <small>لا توجد أيقونة مطابقة.</small> : null}
                        </div>
                        <label className="meal-detail-custom-icon">
                          <span>أيقونة مخصصة</span>
                          <input
                            accept="image/*"
                            disabled={!selectedRestaurantId || uploadStatus === "uploading"}
                            onChange={(event) => handleMealDetailIconUpload(index, event)}
                            type="file"
                          />
                          <input
                            value={detail.iconUrl ?? ""}
                            onChange={(event) => updateMealDetail(index, { iconUrl: event.target.value })}
                            placeholder="https://..."
                          />
                        </label>
                      </div>
                      <button type="button" className="ingredient-remove" onClick={() => removeMealDetail(index)} aria-label="حذف التفصيل">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <button type="button" className="ingredient-empty-add" onClick={addMealDetail}>
                <Plus size={16} />
                إضافة أول تفصيل
              </button>
            )}
          </section>

          <label className="full">
            <span>صورة المنتج</span>
            <input accept="image/*" disabled={!selectedRestaurantId || uploadStatus === "uploading"} onChange={handleImageUpload} type="file" />
          </label>

          <label className="full">
            <span>رابط الصورة بعد الرفع</span>
            <input value={form.imageUrl} onChange={(event) => setPrimaryImage(event.target.value)} />
          </label>

          <section className="product-gallery-manager full">
            <div className="product-gallery-head">
              <div>
                <span>صور المنتج الإضافية</span>
                <small>أول صورة هي الصورة الرئيسية. يمكنك ترتيب الصور التي تظهر في صفحة المنتج.</small>
              </div>
              <button type="button" onClick={() => addProductImageUrl()}>
                <Plus size={16} />
                رابط صورة
              </button>
            </div>
            <label className="gallery-upload-button">
              <ImagePlus size={18} />
              <span>رفع عدة صور</span>
              <input
                accept="image/*"
                disabled={!selectedRestaurantId || uploadStatus === "uploading"}
                multiple
                onChange={handleGalleryImagesUpload}
                type="file"
              />
            </label>
            <div className="product-gallery-list">
              {productGalleryUrls.map((url, index) => (
                <article key={`${url}-${index}`} className="product-gallery-row">
                  <span className="gallery-thumb">
                    {url ? <img src={url} alt="" /> : <ImagePlus size={18} />}
                  </span>
                  <label>
                    <small>{index === 0 ? "الصورة الرئيسية" : `صورة ${index + 1}`}</small>
                    <input value={url} onChange={(event) => updateProductImageUrl(index, event.target.value)} placeholder="https://..." />
                  </label>
                  <div>
                    <button type="button" onClick={() => moveProductImage(index, -1)} disabled={index === 0}>
                      <ArrowRight size={15} />
                    </button>
                    <button type="button" onClick={() => moveProductImage(index, 1)} disabled={index === productGalleryUrls.length - 1}>
                      <ArrowRight size={15} className="flip" />
                    </button>
                    <button type="button" onClick={() => removeProductImage(index)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <label className="full">
            <span>رفع ملف 3D للوجبة</span>
            <input
              accept=".glb,.gltf,.usdz,model/gltf-binary,model/gltf+json"
              disabled={!selectedRestaurantId || modelUploadStatus === "uploading"}
              onChange={handleModelUpload}
              type="file"
            />
            <small className="field-hint">ارفع GLB/GLTF للمشاهدة داخل الصفحة. للآيفون وQuick Look الأفضل توفير ملف USDZ.</small>
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
          {form.imageUrl ? (
            <img src={form.imageUrl} alt={form.name || "معاينة"} />
          ) : (
            <span className="product-preview-placeholder" aria-hidden="true">
              <ImagePlus size={34} />
            </span>
          )}
          <h2>{form.name || "اسم المنتج"}</h2>
          <p>{form.description || "وصف مختصر للمنتج سيظهر هنا."}</p>
          {form.ingredients.length ? <small>{form.ingredients.map((item) => item.name.trim()).filter(Boolean).join(" - ")}</small> : null}
          <b>
            {form.basePrice || "0"} {form.currency}
          </b>
        </aside>
      </section>
    </form>
  );
}
