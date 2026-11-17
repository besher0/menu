"use client";
import { productMoodOptions } from "./product-editor-fields-model";

import { ChangeEvent, FormEvent, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Beef,
  Clock3,
  Drumstick,
  Flame,
  Heart,
  Save,
  Scale,
  Sparkles,
  Star,
  Utensils,
  Wheat,
  X,
  Loader2,
  type LucideIcon
} from "lucide-react";
import popup from "./product-editor-popup.module.css";
import { authHeaders, getBrowserSession, resolveStoredRestaurant, setStoredRestaurant } from "@/lib/session";
import { useProductEditorDraft } from "./use-product-editor-draft";
import { saveProductEditor, ProductEditorSaveError } from "./product-editor-save";
import { productEditorFingerprint, type ProductEditorAggregate, type ProductConfigurationV2, type SaveProductEditor, type ConfigurationIssue, validateConfigurationV2, validateConfigurationCurrencyV2, validateGroupLevelsV2, roleHasPermission } from "@menu/shared";

import { ProductConfigurationEditor } from "./product-configuration/product-configuration-editor";
import { hasSizes, type SourceMap } from "./product-configuration/v62-model";
import { safeProductSaveMessage } from "./product-configuration/configuration-editor-errors";
import { cssVars } from "@/lib/api";
import type { ThemeSettings } from "@menu/shared";
import { ProductEditorFields } from "./product-editor-fields";
import { appendImage, validatedModelUpload, MAX_PRODUCT_IMAGES } from "./product-editor-fields-model";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export type FormState = {
  configuration: ProductConfigurationV2 | null;
  configurationMode: "LEGACY" | "NETWORK";
  name: string;
  categoryId: string;
  description: string;
  basePrice: string;
  currency: string;
  imageUrl: string;
  imageUrls: string[];
  imageReferences: ProductEditorAggregate["product"]["images"];
  moodKeys: string[];
  ingredients: IngredientFormItem[];
  mealDetails: MealDetailFormItem[];
  model3dUrl: string;
  model3dFormat: string;
  vrUrl: string;
  isNew: boolean;
  isFeatured: boolean;
  isPopular: boolean;
};

type IngredientFormItem = {
  id?: string;
  libraryId?: string;
  adminName?: string;
  displayName?: string;
  name: string;
  imageUrl: string;
  isActive?: boolean;
};

type IngredientSuggestion = IngredientFormItem & {
  id?: string;
  usageCount?: number;
};

type MealDetailFormItem = {
  valueType?: "VALUE" | "PRESENCE";
  id?: string;
  libraryId?: string;
  adminName?: string;
  displayName?: string;
  label: string;
  value: string;
  icon: string;
  iconUrl?: string;
  isActive?: boolean;
};

type MealDetailSuggestion = MealDetailFormItem & {
  id?: string;
  usageCount?: number;
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

function emptyProductForm(): FormState {
  return {
    configuration: null,
    configurationMode: "LEGACY",
    name: "",
    categoryId: "",
    description: "",
    basePrice: "",
    currency: "",
    imageUrl: "",
    imageUrls: [],
    imageReferences: [],
    moodKeys: [],
    ingredients: [],
    mealDetails: [],
    model3dUrl: "",
    model3dFormat: "GLB",
    vrUrl: "",
    isNew: false,
    isFeatured: false,
    isPopular: false
  };
}

function normalizedProductImageUrls(urls: string[]) {
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
}

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const popupRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = popupRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close(); document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [modelUploadStatus, setModelUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [selectedRestaurantName, setSelectedRestaurantName] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [previewStyle,setPreviewStyle]=useState<React.CSSProperties>();
  const [moodOptions, setMoodOptions] = useState<MoodOption[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<IngredientSuggestion[]>([]);
  const [ingredientLibraryStatus, setIngredientLibraryStatus] = useState<"idle" | "loading" | "error">("idle");
  const [mealDetailSuggestions, setMealDetailSuggestions] = useState<MealDetailSuggestion[]>([]);
  const [mealDetailLibraryStatus, setMealDetailLibraryStatus] = useState<"idle" | "loading" | "error">("idle");
  const editor = useProductEditorDraft<FormState>(emptyProductForm);
  const form = editor.draft;
  const setForm = editor.setDraft;
  const setConfigurationMode = (mode: "LEGACY" | "NETWORK") => setForm(s => ({ ...s, configurationMode: mode }));
  const [stableId] = useState(() => productId ?? crypto.randomUUID());
  const versions = useRef({ product: 0, configuration: 0, create: !productId });
  const mediaBaseline = useRef({ model3dUrl: "", model3dFormat: "GLB", vrUrl: "" });
  const saveLock = useRef(false);
  const [hydrated, setHydrated] = useState(!productId);
  const [currencyReady, setCurrencyReady] = useState(!!productId);
  const [configurationSources, setConfigurationSources] = useState<SourceMap>(new Map());
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [configurationAssigned, setConfigurationAssigned] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const sourcesChanged = useCallback((value: SourceMap) => setConfigurationSources(value), []);
  const validityChanged = useCallback((issues: ConfigurationIssue[], loading: boolean) => {
    setConfigurationLoading(loading);
  }, []);
  const session = getBrowserSession();
  const memberRole = session?.memberships.find(x => x.restaurant.id === selectedRestaurantId)?.role;
  const canManageConfiguration = session?.user.role === "SUPER_ADMIN" ||
    !!memberRole && roleHasPermission(memberRole as Parameters<typeof roleHasPermission>[0], "product.configuration.manage");
  useEffect(()=>{
    setPreviewStyle(undefined);const restaurant=resolveStoredRestaurant(); if(!restaurant?.slug)return;const controller=new AbortController();
    void fetch(API_URL+"/public/menus/"+encodeURIComponent(restaurant.slug)+"?track=0",{signal:controller.signal,cache:"no-store"})
      .then(async response=>{if(!response.ok)return;const value=await response.json();const theme=(value.data??value).theme as ThemeSettings|undefined;if(theme&&!controller.signal.aborted)setPreviewStyle(cssVars(theme))}).catch(()=>{});
    return()=>controller.abort();
  },[selectedRestaurantId]);
  useEffect(()=>{editor.setState(s=>s.issues.length?{...s,issues:[]}:s)},[form]);
  const sizesControlBase = !!form.configuration && hasSizes(form.configuration, configurationSources);
  useEffect(() => {
    if (!selectedRestaurantId) return;
    let cancelled = false;
    setConfigurationAssigned(false);
    if (!productId) setCurrencyReady(false);
    void fetch(API_URL + "/dashboard/restaurants/current", { headers: selectedRestaurantHeaders(), cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Capability unavailable"); return response.json(); })
      .then(payload => {
        if (cancelled) return;
        const restaurant = payload.data ?? payload;
        setConfigurationAssigned(!!restaurant.subscription?.features?.some((x: { key: string; enabled: boolean }) => x.key === "PRODUCT_CONFIGURATION" && x.enabled));
        if (!productId) {
          if (typeof restaurant.currency !== "string" || !restaurant.currency.trim()) throw new Error("Currency unavailable");
          editor.setState(s => ({ ...s, draft: { ...s.draft, currency: restaurant.currency }, saved: { ...s.saved, currency: restaurant.currency } }));
          setCurrencyReady(true);
        }
      }).catch(() => { if (!cancelled) {
        setConfigurationAssigned(false);
        if (!productId) { setStatus("error"); setMessage("تعذر تحميل عملة المطعم. أعد تحميل الصفحة قبل الحفظ."); }
      } });
    return () => { cancelled = true; };
  }, [selectedRestaurantId, productId]);
  const latestDraft = useRef(form);
  latestDraft.current = form;

  useEffect(() => {
    if (!editor.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editor.dirty]);

  // Native traversal cancellation keeps the current editor/history entry intact on
  // browsers with Navigation API support. Document exits still use beforeunload.
  useEffect(() => {
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    if (!navigation) return;
    const onNavigate = (event: Event) => {
      const traversal = event as Event & { navigationType?: string };
      if (traversal.navigationType !== "traverse" || !event.cancelable) return;
      if (status === "saving" || (editor.dirty && !window.confirm("لديك تغييرات غير محفوظة. هل تريد إغلاق المحرر دون حفظها؟"))) event.preventDefault();
    };
    navigation.addEventListener("navigate", onNavigate);
    return () => navigation.removeEventListener("navigate", onNavigate);
  }, [editor.dirty, status]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value,
      ...(key === "basePrice" && current.configuration ? { configuration: { ...current.configuration, basePrice: String(value).trim() || null } } : {})
    }));
  }

  function patchFields(patch: Partial<FormState>) {
    setForm(current => ({ ...current, ...patch,
      ...(patch.imageUrls ? { imageUrl: patch.imageUrls[0] ?? "" } : {}),
      ...(patch.basePrice !== undefined && current.configuration
        ? { configuration: { ...current.configuration, basePrice: patch.basePrice.trim() || null } } : {})
    }));
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

    let cancelled = false;
    async function loadCategories() {
      try {
        const next: CategoryOption[] = [];
        for (let page = 1; ; page++) {
          const response = await fetch(`${API_URL}/dashboard/categories?limit=100&page=${page}`, { headers: selectedRestaurantHeaders(), cache: "no-store" });
          if (!response.ok) throw new Error("Unable to load categories");
          const payload = await response.json(), body = payload?.data ?? [];
          next.push(...(Array.isArray(body) ? body : body.data ?? []));
          if (cancelled) return;
          if (page >= (body.meta?.pages ?? 1)) break;
        }
        if (!cancelled) setCategories(next.filter(x => x.slug !== "all"));
      } catch { if (!cancelled) setCategories([]); }
    }
    void loadCategories();
    return () => { cancelled = true; };
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
        const nextOptions = productMoodOptions(pages);

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
        const response = await fetch(`${API_URL}/dashboard/media/ingredients`, {
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
                id: item.id,
                libraryId: item.libraryId ?? item.id,
                adminName: item.adminName?.trim(),
                displayName: item.displayName?.trim(),
                name: (item.displayName || item.name)?.trim() ?? "",
                imageUrl: item.imageUrl ?? "",
                isActive: item.isActive ?? true,
                usageCount: Number(item.usageCount ?? 0)
              }))
              .filter((item) => item.name && item.isActive !== false)
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
        const response = await fetch(`${API_URL}/dashboard/media/meal-details`, {
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
                id: item.id,
                libraryId: item.libraryId ?? item.id,
                adminName: item.adminName?.trim(),
                displayName: item.displayName?.trim(),
                label: (item.displayName || item.label)?.trim() ?? "",
                value: item.value?.trim() ?? "",
                valueType: item.valueType,
                icon: DETAIL_ICON_OPTIONS.some((option) => option.key === item.icon) ? item.icon : "utensils",
                iconUrl: item.iconUrl?.trim() ?? "",
                isActive: item.isActive ?? true,
                usageCount: Number(item.usageCount ?? 0)
              }))
              .filter((item) => (item.label || item.value) && item.isActive !== false)
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

    editor.hydrate(emptyProductForm());
    setStatus("idle");
    setUploadStatus("idle");
    setModelUploadStatus("idle");
    setMessage("");
    setConfigurationMode("LEGACY");
  }, [productId]);

  useEffect(() => {
    if (!productId || !selectedRestaurantId) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setHydrated(false);
    async function loadProduct() {
      try {
        const response = await fetch(API_URL + "/dashboard/products/" + productId + "/editor", {
          headers: selectedRestaurantHeaders(), cache: "no-store", signal: controller.signal
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message ?? "تعذر تحميل المنتج.");
        if (cancelled) return;
        const aggregate = (payload.data ?? payload) as ProductEditorAggregate;
        const product = aggregate.product;
        versions.current = { product: aggregate.editVersion, configuration: aggregate.configurationVersion, create: false };
        mediaBaseline.current = aggregate.advancedMedia;
        const imageUrls = product.images.map(image => image.url);
        editor.hydrate({
          ...emptyProductForm(),
          ...product,
          configuration: aggregate.configuration,
          configurationMode: aggregate.configuration ? "NETWORK" : "LEGACY",
          categoryId: product.categoryId ?? "",
          basePrice: product.basePrice ?? "",
          currency: aggregate.currency,
          imageUrl: imageUrls[0] ?? "", imageUrls,
          imageReferences: product.images,
          ingredients: product.ingredients.map(x => ({ ...x, imageUrl: x.imageUrl ?? "" })),
          mealDetails: product.mealDetails.map(x => ({ ...x })),
          ...aggregate.advancedMedia
        });
        setHydrated(true);
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "تعذر تحميل المنتج.");
      }
    }

    void loadProduct();
    return () => { cancelled = true; controller.abort(); };
  }, [productId, selectedRestaurantId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current || !hydrated || !selectedRestaurantId || !currencyReady) return;
    if (!form.name.trim() || !form.categoryId || !categories.some(x => x.id === form.categoryId)) {
      setStatus("error"); setMessage("أدخل اسمًا صالحًا واختر قسمًا متاحًا قبل الحفظ."); return;
    }
    if (form.configuration && canManageConfiguration) {
      setValidationAttempt(n => n + 1);
      const issues = [...validateConfigurationV2(form.configuration), ...validateConfigurationCurrencyV2(form.configuration, form.currency),
        ...validateGroupLevelsV2(form.configuration, id => configurationSources.get(id)?.configuration ?? undefined)];
      if (issues.length || configurationLoading) {
        setStatus("error"); setMessage("أكمل بيانات التكوين والمصادر قبل حفظ المنتج.");
        editor.setState(s => ({ ...s, issues })); return;
      }
    }
    saveLock.current = true;
    setStatus("saving"); setMessage("");
    editor.setState(s => ({ ...s, pending: true, issues: [], conflict: false }));
    const submitted = form;
    try {
      const images = normalizedProductImageUrls(submitted.imageUrls);
      const advancedMedia = { model3dUrl: submitted.model3dUrl, model3dFormat: submitted.model3dFormat, vrUrl: submitted.vrUrl };
      const input: SaveProductEditor = {
        create: versions.current.create, expectedProductVersion: versions.current.product,
        expectedConfigurationVersion: versions.current.configuration,
        product: {
          name: submitted.name, description: submitted.description, categoryId: submitted.categoryId || null,
          basePrice: submitted.basePrice.trim() || null,
          isNew: submitted.isNew, isFeatured: submitted.isFeatured, isPopular: submitted.isPopular, moodKeys: submitted.moodKeys,
          images: images.map((url, index) => submitted.imageReferences.find(x => x.url === url)
            ?? { url, altText: index === 0 ? submitted.name : submitted.name + " " + (index + 1) }),
          ingredients: submitted.ingredients.filter(x => x.name.trim()).map(x => ({
            ...(x.libraryId ? { libraryId: x.libraryId } : {}), name: x.name,
            imageUrl: x.imageUrl
          })),
          mealDetails: submitted.mealDetails.filter(x => x.libraryId || x.value.trim()).map(x => ({
            ...(x.libraryId ? { libraryId: x.libraryId } : {}), label: x.label, value: x.value,
            icon: x.icon, iconUrl: x.iconUrl ?? "", ...(x.valueType ? { valueType: x.valueType } : {})
          }))
        },
        ...(submitted.configuration && canManageConfiguration ? { configuration: { ...submitted.configuration, productId: stableId,
          revision: versions.current.configuration + 1 } } : {}),
        ...(isSuperAdmin && productEditorFingerprint(advancedMedia) !== productEditorFingerprint(mediaBaseline.current)
          ? { advancedMedia } : {})
      };
      const aggregate = await saveProductEditor((path, init) => fetch(API_URL + path, {
        ...init, headers: { ...selectedRestaurantHeaders(), ...init?.headers }
      }), stableId, input, uploadStatus !== "idle" || modelUploadStatus !== "idle");
      versions.current = { product: aggregate.editVersion, configuration: aggregate.configurationVersion, create: false };
      mediaBaseline.current = aggregate.advancedMedia;
      const unchanged = productEditorFingerprint(latestDraft.current) === productEditorFingerprint(submitted);
      if (unchanged) {
        const p = aggregate.product;
        const imageUrls = p.images.map(x => x.url);
        editor.hydrate({ ...submitted, ...p, categoryId: p.categoryId ?? "", basePrice: p.basePrice ?? "",
          configuration: aggregate.configuration, imageUrls, imageUrl: imageUrls[0] ?? "",
          imageReferences: p.images,
          ingredients: p.ingredients.map(x => ({ ...x, imageUrl: x.imageUrl ?? "" })),
          mealDetails: p.mealDetails, ...aggregate.advancedMedia });
      } else editor.saved(submitted);
      setStatus("success"); setMessage("تم حفظ المنتج بنجاح.");
      window.dispatchEvent(new Event("ordersawa:product-saved"));
      // Keep this editor open: a pending edit cannot be discarded by delayed navigation.
      if (!productId && unchanged)
        router.replace("/dashboard/products/" + encodeURIComponent(stableId) + "/edit");
    } catch (error) {
      setStatus("error");
      setMessage(safeProductSaveMessage(error));
      editor.setState(s => ({ ...s, pending: false, conflict: error instanceof ProductEditorSaveError && error.status === 409,
        issues: error instanceof ProductEditorSaveError ? error.issues : [] }));
    } finally { saveLock.current = false; }
  }

  const imageUploadLock = useRef(false);
  async function handleGalleryImagesUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget, files = Array.from(input.files ?? []);
    if (!files.length || imageUploadLock.current) return;
    if (latestDraft.current.imageUrls.length + files.length > MAX_PRODUCT_IMAGES) {
      setUploadStatus("error"); setMessage("الحد الأقصى خمس صور. لم تُرفع أو تُحذف أي صورة من هذه المحاولة."); input.value = ""; return;
    }
    imageUploadLock.current = true; setUploadStatus("uploading"); setMessage("");
    try {
      for (const file of files) {
        const body = new FormData(); body.append("file", file); body.append("type", "IMAGE");
        body.append("altText", latestDraft.current.name || file.name);
        const response = await fetch(`${API_URL}/dashboard/media/upload`, { method: "POST", headers: selectedRestaurantHeaders(), body });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message ?? "تعذر رفع الصورة. أعد اختيار الصور التي لم تُرفع.");
        const url = payload?.data?.url ?? payload?.url;
        if (typeof url !== "string" || !url.trim()) throw new Error("لم يُعد الرفع رابط صورة صالحًا.");
        // Append each successful upload to the latest draft, retaining concurrent text/tree edits and partial success.
        setForm(current => { const imageUrls = appendImage(current.imageUrls, url); return { ...current, imageUrls, imageUrl: imageUrls[0] ?? "" }; });
      }
      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error"); setMessage(error instanceof Error ? error.message : "تعذر رفع الصور.");
    } finally { imageUploadLock.current = false; input.value = ""; }
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

      const model = validatedModelUpload(payload?.data ?? payload);
      patchFields(model);
      setModelUploadStatus("idle");
    } catch (error) {
      setModelUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع ملف 3D.");
    } finally {
      event.target.value = "";
    }
  }

  function requestClose() {
    if (status === "saving") return;
    if (editor.dirty && !window.confirm("لديك تغييرات غير محفوظة. هل تريد إغلاق المحرر دون حفظها؟")) return;
    router.replace("/dashboard/products", { scroll: false });
  }

  return (
    <dialog ref={popupRef} className={popup.modal} dir="rtl" aria-labelledby="product-editor-title"
      onCancel={e => { if (e.target !== e.currentTarget) return; e.preventDefault(); requestClose(); }}
      onClick={e => { if (e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) requestClose(); } }}>
    <form className={popup.form} onSubmit={handleSubmit}>
      <header className={popup.header}>
        <h3 id="product-editor-title">{productId ? "تعديل صنف — " + form.name : "إضافة صنف"}</h3>
        <button className={popup.close} type="button" aria-label="إغلاق محرر المنتج" disabled={status === "saving"} onClick={requestClose}><X size={18} /></button>
      </header>
      <div className={popup.body} data-product-editor-scroll>

      <ProductEditorFields draft={form} patch={patchFields} categories={categories} moods={moodOptions}
        ingredients={ingredientSuggestions} details={mealDetailSuggestions}
        ingredientStatus={ingredientLibraryStatus} detailStatus={mealDetailLibraryStatus}
        disabled={!hydrated || status === "saving"} sizesControlBase={sizesControlBase} baseReadOnly={!!form.configuration && !canManageConfiguration}
        uploading={uploadStatus === "uploading"} uploadError={uploadStatus === "error"}
        onUpload={handleGalleryImagesUpload} onDismissUploadError={() => { setUploadStatus("idle"); setMessage(""); }} />
      {isSuperAdmin && <section className={popup.modelSection} aria-label="إدارة 3D الحالية">
        <div className={popup.modelHead}><h3>صورة 3D</h3></div>
        <div className={popup.modelActions}>
          <label className={popup.modelUpload}>رفع ملف / صورة 3D
            <input aria-label="رفع ملف 3D للوجبة" accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              disabled={!selectedRestaurantId || modelUploadStatus === "uploading" || status === "saving"}
              onChange={handleModelUpload} type="file" />
          </label>
          <span className={popup.modelState}>{form.model3dUrl ? (form.model3dUrl.split("?")[0].split("/").pop() || "ملف محفوظ") : "لا يوجد ملف 3D"}</span>
        </div>
      </section>}
      <section aria-label="حالة حفظ المنتج" aria-live="polite">
        {modelUploadStatus === "uploading" && <p className="form-message">يتم رفع ملف 3D...</p>}
        {editor.dirty && <small>تغييرات غير محفوظة</small>}
        {message && <p role={status === "error" ? "alert" : "status"} className={status === "success" ? "form-message success" : "form-message"}>{message}</p>}
      </section>
      <ProductConfigurationEditor productName={form.name} previewStyle={previewStyle} serverIssues={editor.issues} productId={stableId} restaurantId={selectedRestaurantId} currency={form.currency}
        basePrice={form.basePrice.trim() || null} configuration={form.configuration}
        canManage={canManageConfiguration && hydrated} assigned={configurationAssigned} pending={status === "saving"}
        validationAttempt={validationAttempt} request={(path, init) => fetch(API_URL + path, {
          ...init, headers: { ...selectedRestaurantHeaders(), ...init?.headers }, cache: "no-store"
        })}
        onChange={configuration => setForm(current => ({ ...current, configuration, configurationMode: "NETWORK",
          basePrice: configuration.basePrice ?? "" }))}
        onSources={sourcesChanged} onValidity={validityChanged} />
      </div>
      <footer className={popup.footer}>
        <button className={popup.save} type="submit" aria-label="حفظ المنتج" disabled={!hydrated || !selectedRestaurantId || !currencyReady || status === "saving" || uploadStatus !== "idle" || modelUploadStatus !== "idle" || configurationLoading}>
          {status === "saving" ? <Loader2 className="spin" size={18} /> : null} حفظ الصنف
        </button>
        <button type="button" disabled={status === "saving"} onClick={requestClose}>إلغاء</button>
      </footer>
    </form>
    </dialog>
  );
}
