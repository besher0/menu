"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createElement, type PointerEvent, type TouchEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Beef, ChevronDown, ChevronLeft, ChevronRight, Clock3, Drumstick, Facebook, Flame, Heart, Home, Image as ImageIcon, Instagram, LayoutGrid, List, Loader2, Menu, MessageCircle, Minus, Pencil, Plus, Rotate3D, Scale, ShoppingBag, ShoppingCart, Sparkles, Star, Trash2, Truck, Utensils, Wheat, X, type LucideIcon } from "lucide-react";
import { PublicCategory, PublicMealDetail, PublicMenuData, PublicProduct, cssVars } from "@/lib/api";
import { getPublicProductConfiguration, getPublicProductQuote, PublicProductQuoteError, type PublicProductQuoteResponse } from "@/lib/api";
import { multiplyMoney, sumMoney } from "@menu/shared";
import { displayCurrencyAmount } from "@/lib/currency-display";
import { isRestaurantSubdomainHost, restaurantPath } from "@/lib/public-routes";
import { ProductConfigurator } from "./product-configurator";
import { rebaseSelectionRevisions } from "./product-configurator-model";
import { networkCartChoiceLabels, networkCartHeading } from "./cart-presentation";
import {
  acceptNetworkRecheck,
  addOrEditNetworkCartItem,
  applyNetworkRecheck,
  applyRebasedNetworkRecheck,
  cartNeedsPreviewGate,
  createNetworkCartLineId,
  networkCartItemFromQuote,
  putLegacyCartItem,
  restoreCartStorage,
  serializeCartStorage,
  shouldUseTrustedWhatsappCheckout,
  updateCartLineNote,
  updateCartLineQuantity,
  type CartItem,
  type LegacyCartItem,
  type NetworkCartItem
} from "./cart-model";
import { cartDisplayedTotal, useTrustedWhatsappCheckout } from "./trusted-whatsapp-checkout";

type PublicLanguage = "ar" | "en";
type CategoryProductListLayout = "single" | "double";
type MenuDisplayMode = "large" | "list";
type ProductMediaMode = "image" | "3d";
type NormalizedIngredient = { name: string; imageUrl?: string | null };
type NormalizedMealDetail = { label: string; value: string; icon: string; iconUrl?: string | null };
type FulfillmentType = "pickup" | "delivery";
type PublicThemeUiSettings = NonNullable<PublicMenuData["theme"]["publicUi"]> & {
  whatsappOrderingEnabled?: boolean;
};
type CheckoutDetails = {
  fulfillmentType: FulfillmentType;
  deliveryArea?: string;
  deliveryNear?: string;
  deliveryBeside?: string;
  orderNote?: string;
  pickupTime?: string;
};

const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const MENU_SECTION_SCROLL_GAP = 6;
const BANNER_AUTO_ADVANCE_MS = 3000;

const translations = {
  ar: {
    chooseCategory: "اختر أحد الأصناف وتصفح..",
    menu: "القائمة",
    close: "إغلاق",
    newOrderFrom: "طلب جديد من",
    items: "العناصر:",
    total: "الإجمالي",
    time: "الوقت",
    cartItems: "عناصر",
    whatsapp: "واتساب",
    language: "اللغة",
    complaints: "الشكاوي",
    social: "التواصل الاجتماعي",
    questions: "الأسئلة",
    rating: "تقييم",
    switchLanguage: "English",
    moodToday: "شو مزاجك اليوم؟",
    todayOffer: "عرض اليوم",
    mostPopular: "الأكثر طلباً",
    newItems: "جديدنا",
    viewAll: "عرض الكل",
    newTaste: "طعم جديد ومميز",
    mealDetails: "تفاصيل الوجبة",
    itemCount: "صنف",
    add: "إضافة",
    viewMealRealSize: "شاهد الوجبة بحجمها الحقيقي",
    arHint: "وجود 3D/AR يعتمد على الباقة والملف المرفوع",
    tryAr: "تجربة الواقع المعزز",
    mealIncludes: "ماذا تحتوي الوجبة؟",
    approximateWeight: "الوزن التقريبي",
    meatType: "نوع اللحم",
    breadType: "نوع الخبز",
    spiceLevel: "مستوى الحدة",
    chicken: "دجاج",
    plate: "صحن",
    medium: "متوسط",
    addToCart: "إضافة إلى السلة",
    startingAt: "ابتداءً من",
    youMayLike: "قد يعجبك أيضاً",
    newBadge: "جديد",
    home: "الرئيسية",
    offers: "العروض",
    settings: "الإعدادات",
    hours: "الدوام",
    listView: "عرض قائمة",
    gridView: "عرض بطاقات",
    photos: "الصور",
    photo: "صورة",
    open3d: "تشغيل 3D",
    openVr: "تشغيل VR",
    noVrPreview: "افتح تجربة VR في نافذة جديدة",
    cart: "السلة",
    editCart: "تعديل السلة",
    hideCart: "إخفاء السلة",
    sendOrder: "إرسال الطلب",
    preparingOrder: "يتم تجهيز الطلب...",
    cartReady: "طلبك جاهز للإرسال",
    cartTotal: "المجموع",
    orderError: "تعذر إنشاء الطلب، سيتم فتح واتساب مباشرة",
    removeItem: "حذف المنتج",
    emptyCart: "السلة فارغة",
    viewCart: "عرض السلة",
    checkoutTitle: "تأكيد الطلب",
    subtotal: "سعر الأصناف",
    deliveryFee: "رسوم التوصيل",
    finalTotal: "المجموع النهائي",
    sendViaWhatsapp: "ارسال عبر الوتس",
    selectedItems: "العناصر المختارة",
    orderNumber: "رقم الطلب"
  },
  en: {
    chooseCategory: "Choose a category and browse..",
    menu: "Menu",
    close: "Close",
    newOrderFrom: "New order from",
    items: "Items:",
    total: "Total",
    time: "Time",
    cartItems: "items",
    whatsapp: "WhatsApp",
    language: "Language",
    complaints: "Complaints",
    social: "Social media",
    questions: "Questions",
    rating: "Rating",
    switchLanguage: "العربية",
    moodToday: "What are you craving today?",
    todayOffer: "Today offer",
    mostPopular: "Most popular",
    newItems: "New items",
    viewAll: "View all",
    newTaste: "Fresh and special taste",
    mealDetails: "Meal details",
    itemCount: "items",
    add: "Add",
    viewMealRealSize: "View the meal in real size",
    arHint: "3D/AR availability depends on the plan and uploaded file",
    tryAr: "Try augmented reality",
    mealIncludes: "What does the meal include?",
    approximateWeight: "Approximate weight",
    meatType: "Meat type",
    breadType: "Bread type",
    spiceLevel: "Spice level",
    chicken: "Chicken",
    plate: "Plate",
    medium: "Medium",
    addToCart: "Add to cart",
    startingAt: "Starting at",
    youMayLike: "You may also like",
    newBadge: "New",
    home: "Home",
    offers: "Offers",
    settings: "Settings",
    hours: "Hours",
    listView: "List view",
    gridView: "Grid view",
    photos: "Photos",
    photo: "Photo",
    open3d: "Open 3D",
    openVr: "Open VR",
    noVrPreview: "Open VR experience in a new window",
    cart: "Cart",
    editCart: "Edit cart",
    hideCart: "Hide cart",
    sendOrder: "Send order",
    preparingOrder: "Preparing order...",
    cartReady: "Your order is ready",
    cartTotal: "Total",
    orderError: "Could not create the order, opening WhatsApp directly",
    removeItem: "Remove item",
    emptyCart: "Your cart is empty",
    viewCart: "View cart",
    checkoutTitle: "Confirm order",
    subtotal: "Items subtotal",
    deliveryFee: "Delivery fee",
    finalTotal: "Final total",
    sendViaWhatsapp: "Send via WhatsApp",
    selectedItems: "Selected items",
    orderNumber: "Order number"
  }
} as const;

type PublicTranslations = Record<keyof typeof translations.ar, string>;

type MoodItem = {
  key?: string;
  label: string;
  href: string;
  iconUrl?: string;
  iconPosition?: "start" | "end" | "top" | "bottom" | "manual";
  iconX?: number;
  iconY?: number;
  iconWidth?: number;
  iconHeight?: number;
  color?: string;
  backgroundType?: PublicCategory["backgroundType"];
  backgroundValue?: string | null;
  backgroundCss?: string | null;
  visualScrollEnabled?: boolean;
};

function parseIconPosition(value?: string | null) {
  if (!value || ["start", "end", "top", "bottom"].includes(value)) {
    return { mode: (value ?? "end") as MoodItem["iconPosition"], x: 78, y: 50 };
  }

  const [rawX = "78", rawY = "50"] = value.split(",");
  return {
    mode: "manual" as const,
    x: Math.min(100, Math.max(0, Number(rawX) || 78)),
    y: Math.min(100, Math.max(0, Number(rawY) || 50))
  };
}

type CategoryChipStyle = React.CSSProperties & {
  "--category-image-x": string;
  "--category-image-y": string;
  "--category-icon-width": string;
  "--category-icon-height": string;
};

function categoryChipStyle(category: PublicCategory): CategoryChipStyle {
  const position = parseIconPosition(category.imagePosition);
  return {
    ...visualBackgroundStyle(category),
    "--category-image-x": `${position.x}%`,
    "--category-image-y": `${position.y}%`,
    "--category-icon-width": `${category.imageWidth ?? 66}px`,
    "--category-icon-height": `${category.imageHeight ?? 56}px`
  } as CategoryChipStyle;
}

function productPrice(product: PublicProduct) {
  return product.price ?? product.basePrice;
}

function isNetworkProduct(product: PublicProduct) {
  return product.productConfiguration?.mode === "NETWORK";
}

function legacyProductPrice(product: PublicProduct) {
  const price = productPrice(product);
  if (price === null) return null;
  const parsed = typeof price === "number" ? price : Number(price);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasLegacyOrderPrice(product: PublicProduct) {
  return !isNetworkProduct(product) && legacyProductPrice(product) !== null;
}

function moodMenuHref(restaurantSlug: string, key: string, useSubdomainRoutes = false) {
  return `${restaurantPath(restaurantSlug, "/menu", useSubdomainRoutes)}?mood=${encodeURIComponent(key)}`;
}

function collectionMenuHref(restaurantSlug: string, collection: "popular" | "new", useSubdomainRoutes = false) {
  return `${restaurantPath(restaurantSlug, "/menu", useSubdomainRoutes)}?collection=${collection}`;
}

function safeInternalHref(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function productHref(restaurantSlug: string, product: PublicProduct, returnHref?: string | null, useSubdomainRoutes = false) {
  const href = restaurantPath(restaurantSlug, `/product/${encodeURIComponent(product.id || product.slug)}`, useSubdomainRoutes);
  const safeReturnHref = safeInternalHref(returnHref);
  return safeReturnHref ? `${href}?from=${encodeURIComponent(safeReturnHref)}` : href;
}

function normalizeRestaurantInternalHref(restaurantSlug: string, href: string, useSubdomainRoutes: boolean) {
  const sameRestaurantPrefix = `/m/${restaurantSlug}`;

  if (href === sameRestaurantPrefix) {
    return restaurantPath(restaurantSlug, "/", useSubdomainRoutes);
  }

  if (href.startsWith(`${sameRestaurantPrefix}/`)) {
    return restaurantPath(restaurantSlug, href.slice(sameRestaurantPrefix.length), useSubdomainRoutes);
  }

  return href;
}

function navigateBack(fallbackHref: string, navigateTo?: (href: string) => void) {
  window.dispatchEvent(new Event("app:navigation-start"));
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  if (navigateTo) {
    navigateTo(fallbackHref);
  }
}

function isProductRouteMatch(product: PublicProduct, value?: string) {
  if (!value) return false;
  const decoded = normalizeMenuKey(value);
  return product.id === value
    || product.slug === value
    || normalizeMenuKey(product.id) === decoded
    || normalizeMenuKey(product.slug) === decoded;
}

function normalizeMenuKey(value?: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim().toLowerCase().replace(/\s+/g, "-");
  } catch {
    return value.trim().toLowerCase().replace(/\s+/g, "-");
  }
}

function productMoodKeys(product: PublicProduct) {
  return product.moodKeys?.length ? product.moodKeys : product.moodKey ? [product.moodKey] : [];
}

function mealDetailIcon(iconKey?: string | null): LucideIcon {
  const icons: Record<string, LucideIcon> = {
    beef: Beef,
    clock: Clock3,
    drumstick: Drumstick,
    flame: Flame,
    heart: Heart,
    scale: Scale,
    sparkles: Sparkles,
    star: Star,
    utensils: Utensils,
    wheat: Wheat
  };

  return icons[iconKey || ""] ?? Utensils;
}

function normalizeConfiguredMealDetails(details?: PublicMealDetail[]) {
  return (details ?? [])
    .map((detail) => ({
      label: (detail.displayName || detail.label)?.trim() ?? "",
      value: detail.value?.trim() ?? "",
      icon: detail.icon?.trim() || "utensils",
      iconUrl: detail.iconUrl?.trim() ?? ""
    }))
    .filter((detail) => detail.label || detail.value);
}

function productMealDetails(product: PublicProduct, t: PublicTranslations): NormalizedMealDetail[] {
  if (Array.isArray(product.nutrition?.details)) {
    return normalizeConfiguredMealDetails(product.nutrition.details);
  }

  const protein = product.nutrition?.protein ?? t.chicken;
  return [
    { label: t.approximateWeight, value: product.nutrition?.weight ?? "200 mg", icon: "scale" },
    { label: t.meatType, value: protein, icon: protein.toLowerCase().includes("لحم") ? "beef" : "drumstick" },
    { label: t.breadType, value: product.nutrition?.breadType ?? t.plate, icon: "wheat" },
    { label: t.spiceLevel, value: product.nutrition?.spice ?? t.medium, icon: "flame" }
  ];
}

function menuSectionScrollOffset(strip: HTMLElement | null, showNestedCategoryStrip: boolean) {
  if (!showNestedCategoryStrip) {
    return 16;
  }

  return (strip?.getBoundingClientRect().height ?? 79) + MENU_SECTION_SCROLL_GAP;
}

function visualBackgroundStyle(input: Pick<PublicCategory, "backgroundType" | "backgroundValue" | "backgroundCss" | "color">): React.CSSProperties {
  const value = input.backgroundValue ?? input.color ?? "#e51f2a";

  if (input.backgroundCss) {
    return { background: input.backgroundCss };
  }

  if (input.backgroundType === "IMAGE" || input.backgroundType === "TEXTURE") {
    return { backgroundImage: `url(${value})`, backgroundSize: "cover", backgroundPosition: "center" };
  }

  if (input.backgroundType === "GRADIENT" || input.backgroundType === "PATTERN") {
    return { background: value };
  }

  return { backgroundColor: value };
}

function formatOpeningHours(hours?: Array<Record<string, unknown>> | Record<string, unknown> | null, language: PublicLanguage = "ar") {
  if (!hours) return null;
  const dayNames = language === "ar"
    ? ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
    : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const list = Array.isArray(hours) ? hours : Object.values(hours);
  const rows = list
    .filter((hour): hour is Record<string, unknown> => Boolean(hour) && typeof hour === "object")
    .slice(0, 7)
    .map((hour) => {
      const dayIndex = Number(hour.day ?? 0);
      const day = dayNames[dayIndex] ?? String(hour.day ?? "");
      const closed = Boolean(hour.isClosed);
      const from = String(hour.opensAt ?? "");
      const to = String(hour.closesAt ?? "");
      return `${day}: ${closed ? (language === "ar" ? "مغلق" : "Closed") : `${from} - ${to}`}`;
    })
    .filter((row) => row.trim().length > 2);
  return rows.length ? rows : null;
}

function productImage(product: Pick<PublicProduct, "imageUrl" | "images">) {
  return product.imageUrl ?? product.images?.find((image) => image.url)?.url ?? null;
}

function productImages(product: PublicProduct) {
  const images = [
    ...(product.imageUrl ? [{ url: product.imageUrl, altText: product.name }] : []),
    ...(product.images ?? [])
  ];
  const uniqueImages = new Map<string, { url: string; altText?: string | null }>();

  images.forEach((image) => {
    if (image.url && !uniqueImages.has(image.url)) {
      uniqueImages.set(image.url, image);
    }
  });

  return Array.from(uniqueImages.values());
}

function ProductImageMedia({
  product,
  image,
  decorative = false
}: {
  product: Pick<PublicProduct, "name" | "imageUrl" | "images">;
  image?: { url?: string | null; altText?: string | null } | null;
  decorative?: boolean;
}) {
  const imageUrl = image?.url?.trim() || productImage(product) || "";

  if (imageUrl) {
    return <img src={imageUrl} alt={decorative ? "" : image?.altText || product.name} aria-hidden={decorative || undefined} />;
  }

  return (
    <span
      className="product-image-placeholder"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : product.name}
    >
      <ImageIcon size={24} />
    </span>
  );
}

function isFeatured(product: PublicProduct) {
  return product.isFeatured ?? product.featured ?? false;
}

function isPopular(product: PublicProduct) {
  return product.isPopular ?? product.popular ?? false;
}

function isNew(product: PublicProduct) {
  return product.isNew ?? product.new ?? false;
}

function publicTemplate(data: PublicMenuData) {
  const normalizedType = data.restaurant.type?.trim().toLowerCase() ?? "";
  return data.theme?.publicUi?.template === "vertigo" || normalizedType.includes("vertigo") || normalizedType.includes("فيرتيغو")
    ? "vertigo"
    : "default";
}

function footerVariant(data: PublicMenuData) {
  return data.theme?.publicUi?.footerVariant === "floating-pill" || publicTemplate(data) === "vertigo" ? "floating-pill" : "default";
}

function bannerHref(
  restaurantSlug: string,
  banner: { targetUrl?: string; targetProductId?: string },
  products: PublicProduct[],
  useSubdomainRoutes = false
) {
  const product = banner.targetProductId
    ? products.find((item) => item.id === banner.targetProductId || item.slug === banner.targetProductId)
    : null;

  if (product) {
    return productHref(restaurantSlug, product, null, useSubdomainRoutes);
  }

  const targetUrl = banner.targetUrl?.trim();

  if (!targetUrl || isDefaultMenuBannerTarget(restaurantSlug, targetUrl)) {
    return null;
  }

  return targetUrl
    ? normalizeRestaurantInternalHref(restaurantSlug, targetUrl, useSubdomainRoutes)
    : null;
}

function isDefaultMenuBannerTarget(restaurantSlug: string, targetUrl: string) {
  const normalizedTarget = normalizeMenuTargetPath(targetUrl);
  return normalizedTarget === "/menu" || normalizedTarget === `/m/${restaurantSlug}/menu`;
}

function normalizeMenuTargetPath(targetUrl: string) {
  const trimmed = targetUrl.trim();

  try {
    const url = new URL(trimmed);
    return stripTrailingSlash(url.pathname);
  } catch {
    return stripTrailingSlash(trimmed.split("?")[0]?.split("#")[0] ?? "");
  }
}

function stripTrailingSlash(value: string) {
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

function normalizeSocialUrl(value?: string | null, host?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const path = trimmed.replace(/^@/, "").replace(/^\/+/, "");
  if (host && (path.toLowerCase() === host.toLowerCase() || path.toLowerCase().startsWith(`${host.toLowerCase()}/`))) {
    return `https://${path}`;
  }

  return host ? `https://${host}/${path}` : `https://${path}`;
}

function normalizeWhatsappUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : normalizeSocialUrl(trimmed, "wa.me");
}

function TikTokIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M15.1 3h3.1c.2 1.2.7 2.2 1.5 3 .7.8 1.7 1.3 3 1.5v3.2c-1.6-.1-3.1-.6-4.5-1.5v6.1c0 1.8-.6 3.2-1.8 4.3-1.1 1.1-2.6 1.7-4.4 1.7-1.6 0-3-.5-4.1-1.5-1.1-1-1.7-2.3-1.7-3.9 0-1.7.6-3 1.8-4.1 1.2-1 2.7-1.5 4.6-1.4v3.2c-.9-.1-1.6.1-2.2.5-.5.4-.8 1-.8 1.7 0 .6.2 1.2.7 1.6.4.4 1 .6 1.7.6.8 0 1.5-.3 2-.8.5-.6.8-1.3.8-2.2V3h.3Z"
      />
    </svg>
  );
}

function SocialIcon({ type, size = 20 }: { type: string; size?: number }) {
  if (type === "instagram") return <Instagram size={size} />;
  if (type === "facebook") return <Facebook size={size} />;
  if (type === "tiktok") return <TikTokIcon size={size} />;
  return <MessageCircle size={size} />;
}

function shouldTrackProductView(restaurantSlug: string, productSlug: string) {
  if (typeof window === "undefined") return true;

  const key = `product-view:${restaurantSlug}:${productSlug}`;
  const now = Date.now();
  const lastTrackedAt = Number(window.sessionStorage.getItem(key) ?? 0);

  if (now - lastTrackedAt < 5000) {
    return false;
  }

  window.sessionStorage.setItem(key, String(now));
  return true;
}

function productIngredients(product: PublicProduct): NormalizedIngredient[] {
  return (product.ingredients ?? [])
    .map((ingredient) =>
      typeof ingredient === "string"
        ? { name: ingredient.trim(), imageUrl: null }
        : { name: (ingredient.displayName || ingredient.name)?.trim() ?? "", imageUrl: ingredient.imageUrl ?? null }
    )
    .filter((ingredient) => ingredient.name || ingredient.imageUrl);
}

function getRelatedProducts(products: PublicProduct[], product: PublicProduct) {
  const related: PublicProduct[] = [];
  const seen = new Set([product.slug]);
  const productCategorySlug = product.category?.slug ?? product.categorySlug;

  function addMatches(matches: PublicProduct[]) {
    for (const match of matches) {
      if (seen.has(match.slug)) continue;
      seen.add(match.slug);
      related.push(match);
      if (related.length >= 8) break;
    }
  }

  if (productCategorySlug) {
    addMatches(products.filter((item) => (item.category?.slug ?? item.categorySlug) === productCategorySlug));
  }

  addMatches(products.filter(isPopular));
  addMatches(products.filter((item) => isNew(item) || isFeatured(item)));
  addMatches(products);

  return related.slice(0, 8);
}

export function PublicMenuClient({
  data,
  view,
  productSlug,
  initialUseSubdomainRoutes = true
}: {
  data: PublicMenuData;
  view: "home" | "menu" | "product" | "cart";
  productSlug?: string;
  initialUseSubdomainRoutes?: boolean;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const cartRef = useRef<CartItem[]>([]);
  cartRef.current = cart;
  const cartRecheckGeneration = useRef(0);
  const lineQuoteRequests = useRef(new Map<string, number>());
  const recheckBusyLines = useRef(new Set<string>());
  function nextLineQuoteRequest(lineId: string) {
    const next = (lineQuoteRequests.current.get(lineId) ?? 0) + 1;
    lineQuoteRequests.current.set(lineId, next);
    return next;
  }
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [language, setLanguage] = useState<PublicLanguage>("ar");
  const [drawerTab, setDrawerTab] = useState<"hours" | null>(null);
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashClosing, setSplashClosing] = useState(false);
  const splashClickBlockUntil = useRef(0);
  const [menuNested, setMenuNested] = useState(false);
  const [menuBackSignal, setMenuBackSignal] = useState(0);
  const [useSubdomainRoutes, setUseSubdomainRoutes] = useState(initialUseSubdomainRoutes);
  const storageKey = `cart:${data.restaurant.slug}:main`;
  const languageStorageKey = `language:${data.restaurant.slug}`;
  const splashStorageKey = `splash:${data.restaurant.slug}`;
  const products = data.products;
  const activeProduct = productSlug
    ? products.find((product) => isProductRouteMatch(product, productSlug))
    : products[0];
  const t = translations[language];
  const showPrices = data.restaurant.showPrices ?? true;
  const publicUi = data.theme?.publicUi as PublicThemeUiSettings | undefined;
  const whatsappOrderingEnabled = publicUi?.whatsappOrderingEnabled !== false;
  const currentLanguageLabel = language === "ar" ? "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" : "English";
  const firstBranch = data.restaurant.branches?.[0];
  const publicPath = (pathname = "") => restaurantPath(data.restaurant.slug, pathname, useSubdomainRoutes);

  function navigateTo(href: string) {
    window.dispatchEvent(new Event("app:navigation-start"));
    router.push(href);
  }
  const openingHours = formatOpeningHours(firstBranch?.openingHours, language);
  const allBuilderSections = data.menus?.flatMap((menu) => menu.pages?.flatMap((page) => page.sections ?? []) ?? []) ?? [];
  const hasHomeSections = !data.menus?.length || allBuilderSections.some((section) =>
    ["HERO", "MOOD_STRIP", "FEATURED_PRODUCTS"].includes(section.type) && section.isActive !== false
  );
  const requestedView = view === "home" && !hasHomeSections ? "menu" : view;
  const activeView = !whatsappOrderingEnabled && requestedView === "cart"
    ? hasHomeSections ? "home" : "menu"
    : requestedView;
  const showMenuNavItem = Boolean(data.products.length || data.categories.length);
  const showBottomNav = [hasHomeSections, showMenuNavItem].filter(Boolean).length > 1;
  const isSingleMenuPage = activeView === "menu" && showMenuNavItem && !hasHomeSections;
  const templateKey = publicTemplate(data);
  const bottomNavVariant = footerVariant(data);
  const splashSettings = data.restaurant.splashScreen;
  const splashLogoUrl = splashSettings?.logoUrl ?? data.restaurant.logoUrl;
  const splashBackgroundImageUrl = splashSettings?.backgroundType === "IMAGE" ? splashSettings.backgroundImageUrl : null;
  const splashBackgroundColor = splashSettings?.backgroundColor ?? data.theme?.colors?.primary ?? "#e51f2a";
  const splashLogoX = splashSettings?.logoX ?? 50;
  const splashLogoY = splashSettings?.logoY ?? 50;

  useEffect(() => {
    setUseSubdomainRoutes(isRestaurantSubdomainHost(window.location.host, data.restaurant.slug));
  }, [data.restaurant.slug]);

  useEffect(() => {
    setCartLoaded(false);
    if (!whatsappOrderingEnabled) {
      setCart([]);
      window.localStorage.removeItem(storageKey);
      setCartLoaded(true);
      return;
    }
    const stored = window.localStorage.getItem(storageKey);
    setCart(restoreCartStorage(stored, data.restaurant.slug, data.restaurant.currency ?? "ل.س"));
    setCartLoaded(true);
  }, [data.restaurant.currency, data.restaurant.slug, storageKey, whatsappOrderingEnabled]);

  useEffect(() => {
    const stored = window.localStorage.getItem(languageStorageKey);
    if (stored === "ar" || stored === "en") {
      setLanguage(stored);
    }
  }, [languageStorageKey]);

  useEffect(() => {
    if (!cartLoaded || !whatsappOrderingEnabled) {
      return;
    }
    try {
      window.localStorage.setItem(storageKey, serializeCartStorage(cart, data.restaurant.slug));
    } catch {
      // Storage can be unavailable or full; the in-memory cart remains usable.
    }
  }, [cart, cartLoaded, data.restaurant.slug, storageKey, whatsappOrderingEnabled]);

  useEffect(() => {
    if (!cartLoaded || (activeView !== "cart" && activeView !== "menu")) return;
    const generation = ++cartRecheckGeneration.current;
    const lines = cartRef.current.filter((item): item is NetworkCartItem => item.mode === "NETWORK");
    if (!lines.length) return;
    setCart((current) => current.map((item) => item.mode === "NETWORK" ? { ...item, status: "CHECKING" } : item));
    for (const line of lines) {
      const requestId = nextLineQuoteRequest(line.lineId);
      void getPublicProductQuote(line.restaurantSlug, line.productId, line.selection)
        .then((quote) => {
          if (cartRecheckGeneration.current !== generation || lineQuoteRequests.current.get(line.lineId) !== requestId) return;
          setCart((current) => current.map((item) => item.mode === "NETWORK" && item.lineId === line.lineId && item.identity === line.identity
            ? applyNetworkRecheck(item, quote) : item));
        })
        .catch((error: unknown) => {
          if (cartRecheckGeneration.current !== generation || lineQuoteRequests.current.get(line.lineId) !== requestId) return;
          const known = error instanceof PublicProductQuoteError ? error : null;
          setCart((current) => current.map((item) => item.mode === "NETWORK" && item.lineId === line.lineId && item.identity === line.identity
            ? { ...item, status: known?.status && known.status < 500 ? "INVALID" : "OFFLINE",
              proposedQuote: undefined,
              issues: known?.issues.length ? known.issues : [{ code: known?.code ?? "QUOTE_NETWORK_FAILURE", path: "$cart", message: known?.message ?? "Quote service is unavailable." }] }
            : item));
        });
    }
    return () => { cartRecheckGeneration.current += 1; };
  }, [activeView, cartLoaded, data.restaurant.slug]);

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
  }, [language, languageStorageKey]);

  useEffect(() => {
    const manifest = {
      name: `${data.restaurant.name} Menu`,
      short_name: data.restaurant.name || "Menu",
      start_url: publicPath(),
      scope: publicPath(),
      display: "standalone",
      background_color: "#ffffff",
      theme_color: data.theme?.colors?.primary ?? "#e51f2a",
      dir: language === "ar" ? "rtl" : "ltr",
      lang: language,
      icons: [
        {
          src: data.restaurant.logoUrl || "/assets/public/menu-home.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable"
        }
      ]
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');

    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }

    const previousHref = link.href;
    link.href = href;

    return () => {
      link.href = previousHref;
      URL.revokeObjectURL(href);
    };
  }, [data.restaurant.logoUrl, data.restaurant.name, data.restaurant.slug, data.theme?.colors?.primary, language, useSubdomainRoutes]);

  useEffect(() => {
    if (window.sessionStorage.getItem(splashStorageKey)) {
      return;
    }

    window.sessionStorage.setItem(splashStorageKey, "1");
    setSplashVisible(true);
    setSplashClosing(false);
    const timer = window.setTimeout(() => setSplashVisible(false), 3000);

    return () => window.clearTimeout(timer);
  }, [splashStorageKey]);

  useEffect(() => {
    if (activeView !== "menu") {
      setMenuNested(false);
    }
  }, [activeView]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (activeView !== "product") {
      return;
    }

    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, productSlug]);

  const legacyCart = cart.filter((item): item is LegacyCartItem => item.mode === "LEGACY");
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addNetworkQuote(product: PublicProduct, quote: PublicProductQuoteResponse, editingLineId?: string, quantity = 1, note?: string) {
    if (!showPrices || !whatsappOrderingEnabled || data.networkWhatsappCheckoutEnabled !== true
      || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) return false;
    const lineId = createNetworkCartLineId(cartRef.current.map((item) => item.lineId));
    const incoming = networkCartItemFromQuote({ product, restaurantSlug: data.restaurant.slug, quote, lineId });
    if (!incoming) return false;
    const previous = editingLineId ? cartRef.current.find((item) => item.mode === "NETWORK" && item.lineId === editingLineId) : undefined;
    incoming.note = note ?? previous?.note;
    const remainingUnits = cartRef.current.reduce((sum, item) => sum + item.quantity, 0) - (previous?.quantity ?? 0);
    if (remainingUnits + quantity > 100) return false;
    if (editingLineId) nextLineQuoteRequest(editingLineId);
    const matched = cartRef.current.find((item) => item.mode === "NETWORK" && item.identity === incoming.identity && (item.note ?? "") === (incoming.note ?? ""));
    if (matched) nextLineQuoteRequest(matched.lineId);
    setCart((current) => addOrEditNetworkCartItem(current, incoming, editingLineId, quantity));
    return true;
  }

  function addToCart(product: PublicProduct) {
    if (!whatsappOrderingEnabled || isNetworkProduct(product)) {
      return;
    }
    const price = legacyProductPrice(product);
    if (price === null) return;

    setCart((current) => {
      const existing = current.find((item) => item.mode === "LEGACY" && item.slug === product.slug);
      return putLegacyCartItem(current, product, price, productImage(product), (existing?.quantity ?? 0) + 1);
    });
  }

  function setProductQuantity(product: PublicProduct, quantity: number) {
    if (!whatsappOrderingEnabled || isNetworkProduct(product)) {
      return;
    }
    const price = legacyProductPrice(product);
    if (price === null) return;

    setCart((current) => putLegacyCartItem(current, product, price, productImage(product), Math.max(0, quantity)));
  }

  function updateCartItem(lineId: string, quantity: number) {
    setCart((current) => updateCartLineQuantity(current, lineId, quantity));
  }

  function updateCartNote(lineId: string, note: string) {
    setCart((current) => updateCartLineNote(current, lineId, note));
  }

  function removeCartItem(lineId: string) {
    nextLineQuoteRequest(lineId);
    setCart((current) => current.filter((item) => item.lineId !== lineId));
  }

  function getCartQuantity(slug: string) {
    return cart.find((item) => item.mode === "LEGACY" && item.slug === slug)?.quantity ?? 0;
  }

  async function acceptNetworkPrice(lineId: string): Promise<NetworkCartItem | null> {
    const item = cartRef.current.find((candidate): candidate is NetworkCartItem => candidate.mode === "NETWORK" && candidate.lineId === lineId);
    if (!item || item.status !== "CHANGED") return null;
    const requestId = nextLineQuoteRequest(lineId);
    try {
      const quote = await getPublicProductQuote(item.restaurantSlug, item.productId, item.proposedSelection ?? item.selection);
      if (lineQuoteRequests.current.get(lineId) !== requestId) return null;
      const accepted = acceptNetworkRecheck(item, quote);
      setCart((current) => current.map((candidate) => candidate.mode === "NETWORK" && candidate.lineId === lineId && candidate.identity === item.identity
        ? acceptNetworkRecheck(candidate, quote) : candidate));
      return accepted;
    } catch (error) {
      if (lineQuoteRequests.current.get(lineId) !== requestId) return null;
      const known = error instanceof PublicProductQuoteError ? error : null;
      const invalid = { ...item, status: known?.status && known.status < 500 ? "INVALID" as const : "OFFLINE" as const,
        proposedQuote: undefined, proposedSelection: undefined, issues: known?.issues.length ? known.issues : [{ code: known?.code ?? "QUOTE_NETWORK_FAILURE", path: "$cart", message: known?.message ?? "Quote service is unavailable." }] };
      setCart((current) => current.map((candidate) => candidate.mode === "NETWORK" && candidate.lineId === lineId && candidate.identity === item.identity
        ? invalid
        : candidate));
      return invalid;
    }
  }

  async function retryNetworkLine(lineId: string): Promise<NetworkCartItem | null> {
    const item = cartRef.current.find((candidate): candidate is NetworkCartItem => candidate.mode === "NETWORK" && candidate.lineId === lineId);
    if (!item || recheckBusyLines.current.has(lineId)) return null;
    recheckBusyLines.current.add(lineId);
    const requestId = nextLineQuoteRequest(lineId);
    setCart((current) => current.map((candidate) => candidate.mode === "NETWORK" && candidate.lineId === lineId ? { ...candidate, status: "CHECKING" } : candidate));
    try {
      let quote: PublicProductQuoteResponse;
      let rebased = null;
      try {
        quote = await getPublicProductQuote(item.restaurantSlug, item.productId, item.selection);
      } catch (error) {
        if (!(error instanceof PublicProductQuoteError)
          || !["CONFIGURATION_REVISION_CHANGED", "LINKED_CONFIGURATION_REVISION_CHANGED"].includes(error.code)) throw error;
        const current = await getPublicProductConfiguration(item.restaurantSlug, item.productId);
        if (!current.orderable) throw error;
        rebased = rebaseSelectionRevisions(item.selection, current.configuration,
          new Map(current.linkedProducts.map((source) => [source.productId, source])));
        if (!rebased) throw error;
        quote = await getPublicProductQuote(item.restaurantSlug, item.productId, rebased);
      }
      if (lineQuoteRequests.current.get(lineId) !== requestId) return null;
      const refreshed = rebased ? applyRebasedNetworkRecheck(item, quote, rebased) : applyNetworkRecheck(item, quote);
      setCart((current) => current.map((candidate) => candidate.mode === "NETWORK" && candidate.lineId === lineId && candidate.identity === item.identity
        ? rebased ? applyRebasedNetworkRecheck(candidate, quote, rebased) : applyNetworkRecheck(candidate, quote) : candidate));
      return refreshed;
    } catch (error) {
      if (lineQuoteRequests.current.get(lineId) !== requestId) return null;
      const known = error instanceof PublicProductQuoteError ? error : null;
      const invalid = { ...item, status: known?.status && known.status < 500 ? "INVALID" as const : "OFFLINE" as const,
        proposedQuote: undefined, proposedSelection: undefined, issues: known?.issues.length ? known.issues : [{ code: known?.code ?? "QUOTE_NETWORK_FAILURE", path: "$cart", message: known?.message ?? "Quote service is unavailable." }] };
      setCart((current) => current.map((candidate) => candidate.mode === "NETWORK" && candidate.lineId === lineId && candidate.identity === item.identity
        ? invalid
        : candidate));
      return invalid;
    } finally {
      recheckBusyLines.current.delete(lineId);
    }
  }

  function requestMenuBack() {
    setMenuNested(false);
    setMenuBackSignal((current) => current + 1);
  }

  function goToRestaurantHome() {
    navigateTo(publicPath());
  }

  function openDrawer() {
    setDrawerTab(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerTab(null);
  }

  function blockPostSplashClick(event: React.SyntheticEvent) {
    if (Date.now() < splashClickBlockUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function dismissSplash(event?: React.SyntheticEvent) {
    event?.preventDefault();
    event?.stopPropagation();

    if (splashClosing) {
      return;
    }

    splashClickBlockUntil.current = Date.now() + 500;
    setSplashClosing(true);
    window.setTimeout(() => {
      setSplashVisible(false);
      setSplashClosing(false);
    }, 180);
  }

  const socialLinks = [
    { key: "instagram", label: "Instagram", href: normalizeSocialUrl(data.restaurant.instagramUrl, "instagram.com") },
    { key: "facebook", label: "Facebook", href: normalizeSocialUrl(data.restaurant.facebookUrl, "facebook.com") },
    { key: "tiktok", label: "TikTok", href: normalizeSocialUrl(data.restaurant.tiktokUrl, "tiktok.com") },
    whatsappOrderingEnabled ? { key: "whatsapp", label: "WhatsApp", href: normalizeWhatsappUrl(data.restaurant.whatsappUrl ?? data.restaurant.whatsappPhone) } : null
  ].filter((item): item is { key: string; label: string; href: string | null } => Boolean(item)).filter((item): item is { key: string; label: string; href: string } => Boolean(item.href));

  function normalizeCheckoutDetails(details?: CheckoutDetails): CheckoutDetails | undefined {
    if (!details) return undefined;

    return {
      fulfillmentType: details.fulfillmentType,
      deliveryArea: details.deliveryArea?.trim(),
      deliveryNear: details.deliveryNear?.trim(),
      deliveryBeside: details.deliveryBeside?.trim(),
      orderNote: details.orderNote?.trim(),
      pickupTime: details.pickupTime?.trim()
    };
  }

  function checkoutDetailsMessage(details?: CheckoutDetails) {
    if (!details) return "";

    const lines = [
      details.fulfillmentType ? `طريقة الاستلام: ${details.fulfillmentType === "delivery" ? "توصيل دليفري" : "استلام من المطعم"}` : null,
      details.fulfillmentType === "delivery" && details.deliveryArea ? `المنطقة: ${details.deliveryArea}` : null,
      details.fulfillmentType === "delivery" && details.deliveryNear ? `قريب من: ${details.deliveryNear}` : null,
      details.fulfillmentType === "delivery" && details.deliveryBeside ? `جانب: ${details.deliveryBeside}` : null,
      details.fulfillmentType === "pickup" && details.pickupTime ? `وقت الاستلام: ${details.pickupTime}` : null,
      details.orderNote ? `ملاحظة الطلب: ${details.orderNote}` : null
    ].filter(Boolean);

    return lines.length ? `\n\n${lines.join("\n")}` : "";
  }

  async function sendWhatsappOrder(details?: CheckoutDetails) {
    if (!whatsappOrderingEnabled || !cart.length || cartNeedsPreviewGate(cart, products) || orderSubmitting) {
      return;
    }

    setOrderSubmitting(true);
    setOrderMessage(null);
    const checkoutDetails = normalizeCheckoutDetails(details);

    try {
      const response = await fetch(`${PUBLIC_API_BASE_URL}/public/menus/${data.restaurant.slug}/orders/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fulfillmentType: checkoutDetails?.fulfillmentType,
          deliveryArea: checkoutDetails?.deliveryArea,
          deliveryNear: checkoutDetails?.deliveryNear,
          deliveryBeside: checkoutDetails?.deliveryBeside,
          orderNote: checkoutDetails?.orderNote,
          pickupTime: checkoutDetails?.pickupTime,
          items: legacyCart.map((item) => ({
            productSlug: item.slug,
            quantity: item.quantity,
            ...(item.note?.trim() ? { note: item.note.trim() } : {})
          }))
        })
      });
      const payload = await response.json().catch(() => null) as { data?: { whatsappUrl?: string }; whatsappUrl?: string; message?: string } | null;
      const nextWhatsappUrl = payload?.data?.whatsappUrl ?? payload?.whatsappUrl;

      if (!response.ok || !nextWhatsappUrl) {
        throw new Error(payload?.message ?? "WhatsApp order failed");
      }

      window.open(nextWhatsappUrl, "_blank", "noreferrer");
    } catch {
      setOrderMessage(t.orderError);
      // A failed server checkout must never fall back to stale browser prices.
    } finally {
      setOrderSubmitting(false);
    }
  }

  return (
    <div
      className={`public-screen view-${activeView} template-${templateKey} footer-${bottomNavVariant} ${showPrices ? "" : "prices-hidden"} ${showBottomNav ? "" : "no-bottom-nav"} ${activeView === "menu" && menuNested ? "menu-nested" : ""}`}
      dir={language === "ar" ? "rtl" : "ltr"}
      onContextMenu={(event) => event.preventDefault()}
      onClickCapture={blockPostSplashClick}
      style={cssVars(data.theme)}
    >
      {splashVisible ? (
        <div
          className={splashClosing ? "public-splash closing" : "public-splash"}
          role="button"
          tabIndex={0}
          aria-label={data.restaurant.name}
          onClick={dismissSplash}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
              dismissSplash(event);
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            dismissSplash(event);
          }}
          style={{
            "--splash-bg-color": splashBackgroundColor,
            "--splash-bg-overlay": splashBackgroundImageUrl ? "linear-gradient(180deg, rgb(0 0 0 / 46%), rgb(0 0 0 / 18%) 42%, rgb(0 0 0 / 58%))" : "none",
            "--splash-bg-image": splashBackgroundImageUrl ? `url(${splashBackgroundImageUrl})` : "none",
            "--splash-logo-x": `${splashLogoX}%`,
            "--splash-logo-y": `${splashLogoY}%`
          } as React.CSSProperties}
        >
          {splashLogoUrl ? <img src={splashLogoUrl} alt={data.restaurant.name} /> : <span className="public-logo-fallback" />}
        </div>
      ) : null}
      {activeView !== "product" ? <header className="public-header">
        {activeView === "cart" ? (
          <button onClick={() => navigateBack(publicPath(), navigateTo)} aria-label="الرجوع">
            <ChevronLeft size={22} />
          </button>
        ) : activeView === "menu" && menuNested ? (
          <button onClick={requestMenuBack} aria-label="الرجوع">
            <ArrowLeft size={22} />
          </button>
        ) : isSingleMenuPage ? (
          <button className="public-header-menu-button" onClick={openDrawer} aria-label={t.menu}>
            <Menu size={24} />
          </button>
        ) : activeView === "menu" ? (
          <button onClick={goToRestaurantHome} aria-label="الرجوع">
            <ArrowLeft size={22} />
          </button>
        ) : (
          <button onClick={openDrawer} aria-label={t.menu}>
            <Menu size={24} />
          </button>
        )}
        <p className={isSingleMenuPage ? "public-header-title single-menu-title" : "public-header-title"}>
          {activeView === "cart" ? (
            "تأكيد الطلب"
          ) : templateKey === "vertigo" && activeView === "home" ? (
            ""
          ) : templateKey === "vertigo" && activeView === "menu" ? (
            `أهلاً وسهلاً في ${data.restaurant.name}`
          ) : isSingleMenuPage ? (
            <span className="restaurant-name">{data.restaurant.name.trim() || t.menu}</span>
          ) : (
            t.chooseCategory
          )}
        </p>
        {data.restaurant.logoUrl ? <img src={data.restaurant.logoUrl} alt={data.restaurant.name} /> : <span className="public-logo-fallback" />}
      </header> : null}

      {activeView === "home" ? (
        <HomeView data={data} addToCart={addToCart} t={t} showPrices={showPrices} whatsappOrderingEnabled={whatsappOrderingEnabled} useSubdomainRoutes={useSubdomainRoutes} />
      ) : activeView === "menu" ? (
        <MenuView
          data={data}
          addToCart={addToCart}
          setProductQuantity={setProductQuantity}
          getCartQuantity={getCartQuantity}
          cart={cart}
          updateCartItem={updateCartItem}
          networkCheckoutEnabled={data.networkWhatsappCheckoutEnabled === true}
          language={language}
          t={t}
          showPrices={showPrices}
          whatsappOrderingEnabled={whatsappOrderingEnabled}
          menuBackSignal={menuBackSignal}
          onNestedChange={setMenuNested}
          navigateTo={navigateTo}
          useSubdomainRoutes={useSubdomainRoutes}
        />
      ) : activeView === "product" && activeProduct ? (
        <ProductView
          data={data}
          product={activeProduct}
          addToCart={addToCart}
          setProductQuantity={setProductQuantity}
          getCartQuantity={getCartQuantity}
          cartCount={cartCount}
          cart={cart}
          onNetworkQuote={(quote, editingLineId, quantity) => addNetworkQuote(activeProduct, quote, editingLineId, quantity)}
          t={t}
          language={language}
          showPrices={showPrices}
          whatsappOrderingEnabled={whatsappOrderingEnabled}
          networkWhatsappCheckoutEnabled={data.networkWhatsappCheckoutEnabled === true && whatsappOrderingEnabled}
          navigateTo={navigateTo}
          useSubdomainRoutes={useSubdomainRoutes}
        />
      ) : activeView === "product" ? (
        <main className="product-detail product-empty">
          <ShoppingBag size={34} />
          <b>{language === "ar" ? "المنتج غير متوفر حالياً" : "Product is currently unavailable"}</b>
          <Link href={publicPath("/menu")}>{t.menu}</Link>
        </main>
      ) : (
        <CartView
          data={data}
          cart={cart}
          updateCartItem={updateCartItem}
          updateCartNote={updateCartNote}
          removeCartItem={removeCartItem}
          addToCart={addToCart}
          sendWhatsappOrder={sendWhatsappOrder}
          orderSubmitting={orderSubmitting}
          orderMessage={orderMessage}
          whatsappOrderingEnabled={whatsappOrderingEnabled}
          networkWhatsappCheckoutEnabled={data.networkWhatsappCheckoutEnabled === true && whatsappOrderingEnabled}
          language={language}
          acceptNetworkPrice={acceptNetworkPrice}
          retryNetworkLine={retryNetworkLine}
          saveNetworkEdit={(product, quote, lineId, quantity, note) => addNetworkQuote(product, quote, lineId, quantity, note)}
          t={t}
          showPrices={showPrices}
          useSubdomainRoutes={useSubdomainRoutes}
        />
      )}

      {whatsappOrderingEnabled && cartCount > 0 && activeView !== "cart" && activeView !== "product" ? (
        <Link href={publicPath("/cart")} className={`sticky-cart-button ${showPrices ? "" : "prices-hidden"}`}>
          <ShoppingCart size={20} />
          <span>{t.viewCart}</span>
          <b>{cartCount}</b>
        </Link>
      ) : null}

      <BottomNav
        slug={data.restaurant.slug}
        active={activeView}
        t={t}
        showHome={hasHomeSections}
        showMenu={showMenuNavItem}
        useSubdomainRoutes={useSubdomainRoutes}
      />

      {drawerOpen ? <button className="public-drawer-backdrop" type="button" onClick={closeDrawer} aria-label={t.close} /> : null}

      {drawerOpen ? (
        <aside className="public-drawer" dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
          <button className="drawer-close" onClick={closeDrawer} aria-label={t.close}>
            <X size={24} />
          </button>
          {data.restaurant.logoUrl ? (
            <img className="public-drawer-logo" src={data.restaurant.logoUrl} alt={data.restaurant.name} />
          ) : (
            <span className="public-drawer-logo" />
          )}
          <button type="button" onClick={() => setLanguage((current) => (current === "ar" ? "en" : "ar"))}>
            <span>{t.language}</span>
            <b>{currentLanguageLabel}</b>
          </button>
          <button type="button" className={drawerTab === "hours" ? "active" : ""} onClick={() => setDrawerTab((current) => current === "hours" ? null : "hours")}>
            <span>{t.hours}</span>
            <Clock3 size={18} />
          </button>
          {[t.complaints, t.questions, t.rating].map((item) => (
            <button key={item}>
              <span>{item}</span>
              <ArrowLeft size={18} />
            </button>
          ))}
          {drawerTab === "hours" ? <div className="drawer-restaurant-info">
            <div className="drawer-hours-list">
              {openingHours?.length ? openingHours.map((row) => <small key={row}>{row}</small>) : <small>لا توجد أوقات دوام محددة</small>}
            </div>
          </div> : null}
          <small>Version 0.1.0+12</small>
          <DrawerSocialLinks links={socialLinks} onNavigate={closeDrawer} />
        </aside>
      ) : null}
    </div>
  );
}

function HomeView({
  data,
  addToCart,
  t,
  showPrices,
  whatsappOrderingEnabled,
  useSubdomainRoutes
}: {
  data: PublicMenuData;
  addToCart: (product: PublicProduct) => void;
  t: PublicTranslations;
  showPrices: boolean;
  whatsappOrderingEnabled: boolean;
  useSubdomainRoutes: boolean;
}) {
  const featured = data.products.filter(isFeatured);
  const popular = data.products.filter(isPopular);
  const featuredSlots = featured.slice(0, 10);
  const allPages = data.menus?.flatMap((menu) => menu.pages ?? []) ?? [];
  const homePage = allPages.find((page) => page.isHome && page.sections?.some((section) => section.type === "HERO" && section.isActive !== false))
    ?? allPages.find((page) => page.isHome)
    ?? allPages[0];
  const heroSection = homePage?.sections?.find((section) => section.type === "HERO" && section.isActive !== false);
  const featuredSection = homePage?.sections?.find((section) => section.type === "FEATURED_PRODUCTS" && section.isActive !== false);
  const moodSection = homePage?.sections?.find((section) => section.type === "MOOD_STRIP" && section.isActive !== false);
  const moodItems: MoodItem[] = moodSection?.settings?.moodItems?.length
    ? moodSection.settings.moodItems
      .filter((item) => item.label?.trim())
      .map((item) => {
        const label = item.label.trim();
        const key = item.key?.trim() || label;
        return {
          key,
          label,
          href: moodMenuHref(data.restaurant.slug, key, useSubdomainRoutes),
          iconUrl: item.iconUrl,
          iconPosition: "manual",
          iconX: item.iconX,
          iconY: item.iconY,
          iconWidth: item.iconWidth,
          iconHeight: item.iconHeight,
          color: item.color,
          backgroundType: item.backgroundType,
          backgroundValue: item.backgroundValue,
          backgroundCss: item.backgroundCss,
          visualScrollEnabled: item.visualScrollEnabled
        };
      })
    : [];
  const shouldShowMoodStrip = Boolean(moodSection && moodItems.length > 0);
  const adBanners = heroSection?.settings?.adBanners?.filter((banner) => banner.imageUrl && banner.isActive !== false) ?? [];
  const bannerSlides = adBanners;
  const homeReturnHref = restaurantPath(data.restaurant.slug, "/", useSubdomainRoutes);
  const isVertigo = publicTemplate(data) === "vertigo";
  const heroPromoClassName = [
    "hero-promo",
    bannerSlides.length ? "hero-promo-carousel" : "hero-promo-empty",
    isVertigo && bannerSlides.length === 1 ? "hero-promo-no-dots" : ""
  ].filter(Boolean).join(" ");
  const featuredCardVariant = featuredSection?.settings?.cardVariant ?? (isVertigo ? "featured-overlay-large" : "wide-image");
  const heroImageUrl = heroSection?.settings?.backgroundImageUrl || data.restaurant.heroImageUrl || data.restaurant.logoUrl || "";
  const heroTitle = heroSection?.settings?.title?.trim() ?? "";
  const heroSubtitle = heroSection?.settings?.subtitle?.trim() ?? "";
  const shouldShowVertigoHeroCopy = Boolean(heroTitle || heroSubtitle);
  const [activeBanner, setActiveBanner] = useState(0);
  const bannerTouchStartX = useRef<number | null>(null);

  useEffect(() => {
    setActiveBanner(0);
  }, [bannerSlides.length]);

  useEffect(() => {
    if (bannerSlides.length <= 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActiveBanner((current) => (current + 1) % bannerSlides.length);
    }, BANNER_AUTO_ADVANCE_MS);

    return () => window.clearTimeout(timer);
  }, [activeBanner, bannerSlides.length]);

  function moveBanner(direction: -1 | 1) {
    if (bannerSlides.length <= 1) {
      return;
    }

    setActiveBanner((current) => (current + direction + bannerSlides.length) % bannerSlides.length);
  }

  function handleBannerTouchStart(event: TouchEvent<HTMLElement>) {
    bannerTouchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleBannerTouchEnd(event: TouchEvent<HTMLElement>) {
    const startX = bannerTouchStartX.current;
    bannerTouchStartX.current = null;

    if (startX === null) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? startX;
    const deltaX = endX - startX;

    if (Math.abs(deltaX) < 40) {
      return;
    }

    moveBanner(deltaX > 0 ? 1 : -1);
  }

  return (
    <main className="public-content">
      {isVertigo ? (
        <section className="vertigo-home-hero">
          {heroImageUrl ? <img src={heroImageUrl} alt={data.restaurant.name} /> : null}
          {shouldShowVertigoHeroCopy ? (
            <div className="vertigo-hero-copy">
              {heroTitle ? <h1 dir="auto">{heroTitle}</h1> : null}
              {heroSubtitle ? <p dir="auto">{heroSubtitle}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {shouldShowMoodStrip ? (
        <section className="mood-strip">
          <h1>
            <Flame size={18} />
            {t.moodToday}
          </h1>
          <div>
            {moodItems.map((item, index) => (
              <Link
                key={`${item.label}-${index}`}
                href={item.href}
                scroll
                onClick={() => window.scrollTo(0, 0)}
                className={`mood-chip ${item.visualScrollEnabled ? "visual-scroll" : ""}`}
                style={{
                  ...visualBackgroundStyle(item),
                  "--icon-x": `${item.iconX ?? 78}%`,
                  "--icon-y": `${item.iconY ?? 50}%`,
                  "--icon-width": `${item.iconWidth ?? 34}px`,
                  "--icon-height": `${item.iconHeight ?? 34}px`
                } as React.CSSProperties}
              >
                {item.iconUrl ? <img src={item.iconUrl} alt="" aria-hidden="true" /> : null}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section
        className={heroPromoClassName}
        onTouchStart={handleBannerTouchStart}
        onTouchEnd={handleBannerTouchEnd}
      >
        {bannerSlides.length ? (
          <>
            <div className="hero-promo-track">
              {bannerSlides.map((banner, index) => {
                const href = bannerHref(data.restaurant.slug, banner, data.products, useSubdomainRoutes);
                const className = index === activeBanner ? "hero-promo-slide active" : "hero-promo-slide";
                const content = (
                  <>
                    <img src={banner.imageUrl} alt={banner.title || t.todayOffer} />
                    {banner.badge ? <span>{banner.badge}</span> : null}
                  </>
                );

                return href ? (
                  <Link
                    key={`${banner.imageUrl}-${index}`}
                    className={className}
                    href={href}
                    aria-hidden={index === activeBanner ? undefined : true}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={`${banner.imageUrl}-${index}`}
                    className={className}
                    aria-hidden={index === activeBanner ? undefined : true}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
            {!isVertigo || bannerSlides.length > 1 ? (
              <div className="hero-promo-dots" aria-label="بنرات الإعلان">
                {bannerSlides.map((banner, index) => (
                  <button
                    key={`${banner.imageUrl}-dot-${index}`}
                    type="button"
                    className={index === activeBanner ? "active" : ""}
                    onClick={() => setActiveBanner(index)}
                    aria-label={`البنر ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {isVertigo && featuredCardVariant === "featured-overlay-large" ? (
        <VertigoFeaturedProducts
          title={featuredSection?.settings?.title || "الأصناف المميزة"}
          products={featured.length ? featured : popular}
          restaurantSlug={data.restaurant.slug}
          showPrices={showPrices}
          returnHref={homeReturnHref}
          t={t}
          useSubdomainRoutes={useSubdomainRoutes}
        />
      ) : (
      <ProductRail
        title={t.mostPopular}
        products={popular}
        restaurantSlug={data.restaurant.slug}
        t={t}
        fillPlaceholders={false}
        showPrices={showPrices}
        onAddToCart={whatsappOrderingEnabled ? addToCart : undefined}
        networkConfigureEnabled={whatsappOrderingEnabled && showPrices && data.networkWhatsappCheckoutEnabled === true}
        showViewAll={false}
        returnHref={homeReturnHref}
        useSubdomainRoutes={useSubdomainRoutes}
      />
      )}

      {!isVertigo ? <section className="new-grid">
        <div className="rail-head">
          <h2>
            <Star size={16} />
            {t.newItems}
          </h2>
        </div>
        <div>
          {featuredSlots.map((_, index) => {
            const product = featured[index];
            return product ? (
            <Link key={`${product.id}-${product.slug}`} href={productHref(data.restaurant.slug, product, homeReturnHref, useSubdomainRoutes)} className="wide-product">
              <ProductImageMedia product={product} />
              <b>{product.name}</b>
              <span>{t.newTaste}</span>
              <em>{t.mealDetails}</em>
            </Link>
            ) : (
              <span key={`featured-placeholder-${index}`} className="wide-product wide-product-placeholder" aria-hidden="true" />
            );
          })}
        </div>
      </section> : null}
    </main>
  );
}

function VertigoFeaturedProducts({
  title,
  products,
  restaurantSlug,
  showPrices,
  returnHref,
  t,
  useSubdomainRoutes
}: {
  title: string;
  products: PublicProduct[];
  restaurantSlug: string;
  showPrices: boolean;
  returnHref: string;
  t: PublicTranslations;
  useSubdomainRoutes: boolean;
}) {
  if (!products.length) {
    return null;
  }

  return (
    <section className="vertigo-featured-products">
      <div className="rail-head">
        <h2>{title}</h2>
        <Link href={restaurantPath(restaurantSlug, "/menu", useSubdomainRoutes)}>{t.viewAll}</Link>
      </div>
      <div>
        {products.slice(0, 6).map((product) => (
          <Link key={`${product.id}-${product.slug}`} href={productHref(restaurantSlug, product, returnHref, useSubdomainRoutes)} className="vertigo-feature-card">
            <ProductImageMedia product={product} />
            <div>
              <b>{product.name}</b>
              {product.description ? <p>{product.description}</p> : null}
              {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} priceFirst startingAt={product.productConfiguration?.priceDisplay === "STARTING_AT"} startingAtLabel={t.startingAt} /> : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MenuView({
  data,
  addToCart,
  setProductQuantity,
  getCartQuantity,
  cart,
  updateCartItem,
  networkCheckoutEnabled,
  language,
  t,
  showPrices,
  whatsappOrderingEnabled,
  menuBackSignal,
  onNestedChange,
  navigateTo,
  useSubdomainRoutes
}: {
  data: PublicMenuData;
  addToCart: (product: PublicProduct) => void;
  setProductQuantity: (product: PublicProduct, quantity: number) => void;
  getCartQuantity: (slug: string) => number;
  cart: CartItem[];
  updateCartItem: (lineId: string, quantity: number) => void;
  networkCheckoutEnabled: boolean;
  language: PublicLanguage;
  t: PublicTranslations;
  showPrices: boolean;
  whatsappOrderingEnabled: boolean;
  menuBackSignal: number;
  onNestedChange: (nested: boolean) => void;
  navigateTo: (href: string) => void;
  useSubdomainRoutes: boolean;
}) {
  const searchParams = useSearchParams();
  const menuQuery = searchParams.toString();
  const selectedMood = searchParams.get("mood")?.trim() || "";
  const selectedCollection = searchParams.get("collection") === "popular" || searchParams.get("collection") === "new"
    ? searchParams.get("collection")
    : "";
  const selectedCategoryParam = searchParams.get("category")?.trim() || "";
  const displayParam = searchParams.get("display");
  const allPages = data.menus?.flatMap((menu) => menu.pages ?? []) ?? [];
  const categoryGridSection = allPages
    .flatMap((page) => page.sections ?? [])
    .find((section) => section.type === "CATEGORY_GRID");
  const productListSection = allPages
    .flatMap((page) => page.sections ?? [])
    .find((section) => section.type === "PRODUCT_LIST");
  const isVertigo = publicTemplate(data) === "vertigo";
  const productListLayout: CategoryProductListLayout = data.theme?.layout?.categoryProductListLayout === "single" ? "single" : "double";
  const selectedDisplayParam: MenuDisplayMode = productListLayout === "double"
    ? "list"
    : displayParam === "large" ? "large" : "list";
  const categoryNavVariant = categoryGridSection?.settings?.categoryNavVariant ?? (isVertigo ? "text-tabs" : "image-chips");
  const productCardVariant = productListSection?.settings?.cardVariant ?? (isVertigo ? "horizontal-contained" : "");
  const categoryControlsEnabled = categoryGridSection ? categoryGridSection.isActive !== false : true;
  const showCategoryLanding = categoryControlsEnabled && categoryGridSection?.settings?.showLandingCategories !== false;
  const showNestedCategoryStrip = categoryControlsEnabled && categoryGridSection?.settings?.showNestedCategoryStrip !== false;
  const [selectedCategorySlug, setSelectedCategorySlug] = useState(
    selectedCategoryParam || (selectedMood || selectedCollection || !showCategoryLanding ? "all" : "")
  );
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [activeSpotlightIndex, setActiveSpotlightIndex] = useState(0);
  const spotlightTouchStartX = useRef<number | null>(null);
  const spotlightPointerStartX = useRef<number | null>(null);
  const spotlightPointerStartY = useRef<number | null>(null);
  const spotlightPointerId = useRef<number | null>(null);
  const spotlightDragMoved = useRef(false);
  const manualCategoryScrollUntil = useRef(0);
  const categoryStripRef = useRef<HTMLElement | null>(null);
  const [menuDisplayMode, setMenuDisplayMode] = useState<MenuDisplayMode>(selectedDisplayParam);
  const lastMenuBackSignal = useRef(menuBackSignal);
  const allCategory = useMemo(() => data.categories.find((category) => category.slug === "all"), [data.categories]);
  const regularCategories = useMemo(() => data.categories.filter((category) => category.slug !== "all"), [data.categories]);
  const selectedMoodKey = normalizeMenuKey(selectedMood);
  const moodAliases = new Set([selectedMoodKey]);
  data.menus?.forEach((menu) => {
    menu.pages?.forEach((page) => {
      page.sections?.forEach((section) => {
        section.settings?.moodItems?.forEach((item) => {
          const key = item.key?.trim() || "";
          const label = item.label?.trim() || "";
          if ([key, label].some((value) => normalizeMenuKey(value) === selectedMoodKey)) {
            if (key) moodAliases.add(normalizeMenuKey(key));
            if (label) moodAliases.add(normalizeMenuKey(label));
          }
        });
      });
    });
  });
  const moodProducts = selectedMood
    ? data.products.filter((product) => {
      const productCategorySlug = product.category?.slug ?? product.categorySlug ?? "";
      const category = regularCategories.find((item) => item.slug === productCategorySlug);
      return [
        ...productMoodKeys(product),
        productCategorySlug,
        product.category?.name,
        category?.slug,
        category?.name
      ].some((value) => moodAliases.has(normalizeMenuKey(value)));
    })
    : [];
  const collectionProducts = selectedCollection === "popular"
    ? data.products.filter(isPopular)
    : selectedCollection === "new"
      ? data.products.filter(isFeatured).length ? data.products.filter(isFeatured) : data.products.filter(isNew)
      : [];
  const contextTitle = selectedMood || (selectedCollection === "popular" ? t.mostPopular : selectedCollection === "new" ? t.newItems : "");
  const contextProducts = selectedMood ? moodProducts : collectionProducts;
  const categoryProductsSource = selectedMood ? data.products : selectedCollection ? contextProducts : data.products;
  const visibleProducts = categoryProductsSource;
  const showRowQuantityControls = whatsappOrderingEnabled && productListLayout === "single" && !(isVertigo && productCardVariant === "horizontal-contained");
  const menuReturnParams = new URLSearchParams(menuQuery);

  if (productListLayout === "single") {
    menuReturnParams.set("display", menuDisplayMode);
  } else {
    menuReturnParams.delete("display");
  }

  if (selectedCategorySlug && !selectedMood && !selectedCollection) {
    menuReturnParams.set("category", selectedCategorySlug);
  } else {
    menuReturnParams.delete("category");
  }

  const menuReturnQuery = menuReturnParams.toString();
  const menuReturnHref = `${restaurantPath(data.restaurant.slug, "/menu", useSubdomainRoutes)}${menuReturnQuery ? `?${menuReturnQuery}` : ""}`;
  const activeCategory = selectedCategorySlug === "all"
    ? allCategory
    : regularCategories.find((category) => category.slug === selectedCategorySlug);
  const activeProducts = selectedCategorySlug === "all"
    ? visibleProducts
    : categoryProductsSource.filter((product) => (product.category?.slug ?? product.categorySlug) === selectedCategorySlug);
  const normalizedSpotlightIndex = activeProducts.length
    ? Math.min(Math.max(activeSpotlightIndex, 0), activeProducts.length - 1)
    : 0;
  const canMoveSpotlightPrevious = activeProducts.length > 1 && normalizedSpotlightIndex > 0;
  const canMoveSpotlightNext = activeProducts.length > 1;
  const spotlightProduct = activeProducts[normalizedSpotlightIndex];
  const spotlightCategorySlug = spotlightProduct ? spotlightProduct.category?.slug ?? spotlightProduct.categorySlug ?? "" : "";
  const spotlightCategoryName = spotlightCategorySlug
    ? regularCategories.find((category) => category.slug === spotlightCategorySlug)?.name ?? spotlightProduct?.category?.name ?? ""
    : "";
  const highlightedCategorySlug = menuDisplayMode === "large" && selectedCategorySlug === "all" && spotlightCategorySlug
    ? spotlightCategorySlug
    : selectedCategorySlug;
  const productsWithoutCategory = selectedCategorySlug === "all"
    ? visibleProducts.filter((product) => !regularCategories.some((category) => (product.category?.slug ?? product.categorySlug) === category.slug))
    : [];
  const headerCategories = useMemo(() => data.categories, [data.categories]);

  useEffect(() => {
    if (selectedMood || selectedCollection) {
      setSelectedCategorySlug("all");
    }
  }, [selectedCollection, selectedMood]);

  useEffect(() => {
    const nextCategorySlug = selectedCategoryParam || (selectedMood || selectedCollection || !showCategoryLanding ? "all" : "");
    setSelectedCategorySlug((current) => current === nextCategorySlug ? current : nextCategorySlug);
  }, [selectedCategoryParam, selectedCollection, selectedMood, showCategoryLanding]);

  useEffect(() => {
    setMenuDisplayMode((current) => current === selectedDisplayParam ? current : selectedDisplayParam);
  }, [selectedDisplayParam]);

  useEffect(() => {
    if (!showCategoryLanding && !selectedCategorySlug) {
      setSelectedCategorySlug("all");
    }
  }, [selectedCategorySlug, showCategoryLanding]);

  useEffect(() => {
    onNestedChange(Boolean(selectedCategorySlug) && (showCategoryLanding || Boolean(selectedMood || selectedCollection)));
  }, [onNestedChange, selectedCategorySlug, selectedCollection, selectedMood, showCategoryLanding]);

  useEffect(() => {
    if (lastMenuBackSignal.current === menuBackSignal) {
      return;
    }

    lastMenuBackSignal.current = menuBackSignal;

    if (!selectedCategorySlug) {
      return;
    }

    if (selectedMood || selectedCollection) {
      navigateTo(restaurantPath(data.restaurant.slug, "/", useSubdomainRoutes));
      return;
    }

    if (showCategoryLanding) {
      manualCategoryScrollUntil.current = Date.now() + 500;
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("category");
      window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`);
      setSelectedCategorySlug("");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      return;
    }

    setSelectedCategorySlug("");
  }, [data.restaurant.slug, menuBackSignal, selectedCategorySlug, selectedCollection, selectedMood, showCategoryLanding]);

  useEffect(() => {
    setActiveSpotlightIndex(0);
  }, [selectedCategorySlug, activeProducts.length]);

  useEffect(() => {
    if (!showNestedCategoryStrip || menuDisplayMode !== "list" || !selectedCategorySlug) {
      return;
    }

    const categorySections = regularCategories
      .filter((category) => categoryProductsSource.some((product) => (product.category?.slug ?? product.categorySlug) === category.slug))
      .map((category) => ({ slug: category.slug, id: `category-section-${category.slug}` }));

    function syncActiveCategoryToScroll() {
      if (Date.now() < manualCategoryScrollUntil.current) {
        return;
      }

      const threshold = menuSectionScrollOffset(categoryStripRef.current, showNestedCategoryStrip) + 8;
      let nextSlug = "all";

      for (const section of categorySections) {
        const element = document.getElementById(section.id);
        if (!element) continue;

        if (element.getBoundingClientRect().top <= threshold) {
          nextSlug = section.slug;
        }
      }

      if (selectedCategorySlug !== nextSlug) {
        setSelectedCategorySlug(nextSlug);
      }

      scrollCategoryChipIntoView(nextSlug);
    }

    syncActiveCategoryToScroll();
    window.addEventListener("scroll", syncActiveCategoryToScroll, { passive: true });
    window.addEventListener("resize", syncActiveCategoryToScroll);

    return () => {
      window.removeEventListener("scroll", syncActiveCategoryToScroll);
      window.removeEventListener("resize", syncActiveCategoryToScroll);
    };
  }, [categoryProductsSource, menuDisplayMode, regularCategories, selectedCategorySlug, showNestedCategoryStrip]);

  useEffect(() => {
    if (!showNestedCategoryStrip || !selectedCategorySlug) {
      return;
    }

    const frame = scrollCategoryChipIntoView(selectedCategorySlug);
    return () => window.cancelAnimationFrame(frame);
  }, [selectedCategorySlug, showNestedCategoryStrip]);

  useEffect(() => {
    if (!showNestedCategoryStrip || menuDisplayMode !== "large" || !highlightedCategorySlug) {
      return;
    }

    const frame = scrollCategoryChipIntoView(highlightedCategorySlug);
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedCategorySlug, menuDisplayMode, showNestedCategoryStrip]);

  useEffect(() => {
    if (!selectedCategoryParam || selectedCategoryParam === "all" || selectedMood || selectedCollection || menuDisplayMode !== "list") {
      return;
    }

    manualCategoryScrollUntil.current = Date.now() + 900;
    const frame = scrollToCategory(selectedCategoryParam);
    return () => window.cancelAnimationFrame(frame);
  }, [menuDisplayMode, selectedCategoryParam, selectedCollection, selectedMood]);

  function scrollToCategory(slug: string) {
    const targetId = menuDisplayMode === "large" || slug === "all" ? "menu-products-start" : `category-section-${slug}`;
    return window.requestAnimationFrame(() => {
      const element = document.getElementById(targetId);
      if (!element) {
        return;
      }

      const top = element.getBoundingClientRect().top + window.scrollY - menuSectionScrollOffset(categoryStripRef.current, showNestedCategoryStrip);
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function scrollCategoryChipIntoView(slug: string) {
    return window.requestAnimationFrame(() => {
      const strip = categoryStripRef.current;
      const chips = Array.from(strip?.querySelectorAll<HTMLButtonElement>("[data-category-slug]") ?? []);
      const chip = chips.find((item) => item.dataset.categorySlug === slug);

      if (!strip || !chip) {
        return;
      }

      chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  }

  function selectCategory(slug: string) {
    manualCategoryScrollUntil.current = Date.now() + 900;
    setSelectedCategorySlug(slug);

    if (!selectedMood && !selectedCollection) {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("category", slug);
      if (productListLayout === "single") {
        currentUrl.searchParams.set("display", menuDisplayMode);
      }
      window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`);
    }

    scrollToCategory(slug);
  }

  function moveSpotlightPrevious() {
    if (!canMoveSpotlightPrevious) return false;
    setActiveSpotlightIndex((current) => Math.max(0, Math.min(current, activeProducts.length - 1) - 1));
    return true;
  }

  function moveSpotlightNext() {
    if (!canMoveSpotlightNext) return false;
    setActiveSpotlightIndex((current) => {
      const normalizedCurrent = Math.max(0, Math.min(current, activeProducts.length - 1));
      return (normalizedCurrent + 1) % activeProducts.length;
    });
    return true;
  }

  function moveSpotlight(direction: -1 | 1) {
    if (direction === -1) {
      return moveSpotlightPrevious();
    }

    return moveSpotlightNext();
  }

  function markSpotlightDragged() {
    spotlightDragMoved.current = true;
    window.setTimeout(() => {
      spotlightDragMoved.current = false;
    }, 120);
  }

  function changeMenuDisplayMode(mode: MenuDisplayMode) {
    setMenuDisplayMode(mode);

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("display", mode);
    window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`);
  }

  function openProduct(product: PublicProduct) {
    if (productListLayout === "double") {
      setSelectedProduct(product);
      return;
    }

    // The /m/[slug] route is also used by subdomain rewrites. On a direct /m
    // visit, the initial server prop can precede the host-derived state update.
    const hostUsesSubdomainRoutes = isRestaurantSubdomainHost(window.location.host, data.restaurant.slug);
    const returnHref = `${restaurantPath(data.restaurant.slug, "/menu", hostUsesSubdomainRoutes)}${menuReturnQuery ? `?${menuReturnQuery}` : ""}`;
    navigateTo(productHref(data.restaurant.slug, product, returnHref, hostUsesSubdomainRoutes));
  }

  function handleSpotlightTouchStart(event: TouchEvent<HTMLElement>) {
    spotlightTouchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleSpotlightTouchEnd(event: TouchEvent<HTMLElement>) {
    if (spotlightTouchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? spotlightTouchStartX.current;
    const deltaX = endX - spotlightTouchStartX.current;
    spotlightTouchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    if (moveSpotlight(deltaX > 0 ? 1 : -1)) {
      markSpotlightDragged();
    }
  }

  function handleSpotlightPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;

    spotlightPointerStartX.current = event.clientX;
    spotlightPointerStartY.current = event.clientY;
    spotlightPointerId.current = event.pointerId;
  }

  function handleSpotlightPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch" || spotlightPointerId.current !== event.pointerId
      || spotlightPointerStartX.current === null || spotlightPointerStartY.current === null) return;

    const deltaX = Math.abs(event.clientX - spotlightPointerStartX.current);
    const deltaY = Math.abs(event.clientY - spotlightPointerStartY.current);
    if (deltaX >= 40 && deltaX > deltaY * 1.15 && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleSpotlightPointerEnd(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch" || spotlightPointerId.current !== event.pointerId || spotlightPointerStartX.current === null || spotlightPointerStartY.current === null) {
      return;
    }

    const deltaX = event.clientX - spotlightPointerStartX.current;
    const deltaY = event.clientY - spotlightPointerStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    spotlightPointerStartX.current = null;
    spotlightPointerStartY.current = null;
    spotlightPointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (absX < 40 || absX < absY * 1.15) return;
    event.preventDefault();
    if (moveSpotlight(deltaX > 0 ? 1 : -1)) {
      markSpotlightDragged();
    }
  }

  function handleSpotlightPointerCancel() {
    spotlightPointerStartX.current = null;
    spotlightPointerStartY.current = null;
    spotlightPointerId.current = null;
  }

  function handleSpotlightOpen(product: PublicProduct) {
    if (spotlightDragMoved.current) {
      spotlightDragMoved.current = false;
      return;
    }

    openProduct(product);
  }

  function renderCategoryLanding() {
    return (
      <section className="category-banner-list category-landing-list" id="menu-categories">
        {data.categories.map((category) => {
          const position = parseIconPosition(category.imagePosition);
          const productsCount = category.slug === "all"
            ? visibleProducts.length
            : categoryProductsSource.filter((product) => (product.category?.slug ?? product.categorySlug) === category.slug).length;
          return (
            <button
              type="button"
              key={category.slug}
              className={category.visualScrollEnabled ? "visual-scroll" : ""}
              onClick={() => selectCategory(category.slug)}
              style={{
                ...visualBackgroundStyle(category),
                "--category-overlay": category.backgroundOverlay ?? undefined,
                "--category-image-x": `${position.x}%`,
                "--category-image-y": `${position.y}%`,
                "--category-icon-width": `${category.imageWidth ?? 144}px`,
                "--category-icon-height": `${category.imageHeight ?? 144}px`
              } as React.CSSProperties}
            >
              {category.imageUrl ? (
                <span className="category-banner-visual" aria-hidden="true">
                  <img src={category.imageUrl} alt="" />
                </span>
              ) : null}
              <div className="category-banner-copy">
                <span>{category.name}</span>
                <b>{productsCount} {t.itemCount}</b>
              </div>
              <svg className="category-banner-arrow" viewBox="0 0 38 24" aria-hidden="true">
                <path d="M34 11 C24 8 15 9 6 14" />
                <path d="M14 5 L6 14 L17 20" />
              </svg>
            </button>
          );
        })}
      </section>
    );
  }

  function renderProduct(product: PublicProduct) {
    const productClassName = `${productListLayout === "double" ? "menu-product-card" : "menu-product-row"} ${productCardVariant ? `card-${productCardVariant}` : ""}`.trim();
    const quantity = getCartQuantity(product.slug);
    const networkLines = cart.filter((line): line is NetworkCartItem => line.mode === "NETWORK" && line.productId === product.id);
    const canConfigure = isNetworkProduct(product) && product.productConfiguration?.orderable === true
      && whatsappOrderingEnabled && networkCheckoutEnabled && showPrices;
    const showNetworkControl = canConfigure;
    const productContent = (
      <>
        <span className="menu-product-image-link">
          <ProductImageMedia product={product} />
        </span>
        <div className="menu-product-copy">
          <b>{product.name}</b>
          <p>{product.description}</p>
          {showPrices ? (
            <ProductPrice
              price={productPrice(product)}
              currency={product.currency}
              priceFirst={productListLayout === "double"}
              startingAt={product.productConfiguration?.priceDisplay === "STARTING_AT"}
              startingAtLabel={t.startingAt}
            />
          ) : null}
        </div>
      </>
    );

    return (
      <article key={`${product.id}-${product.slug}`} className={productClassName} data-cart-mode={isNetworkProduct(product) ? "NETWORK" : "LEGACY"}>
        <button type="button" className="menu-product-open" onClick={() => openProduct(product)}>
          {productContent}
        </button>
        {showRowQuantityControls && hasLegacyOrderPrice(product) ? (
          <QuantityControl
            className="menu-product-quantity"
            quantity={quantity}
            onDecrease={() => setProductQuantity(product, quantity - 1)}
            onIncrease={() => addToCart(product)}
            label={product.name}
          />
        ) : showNetworkControl && networkLines.length <= 1 ? (
          <QuantityControl
            className="menu-product-quantity"
            quantity={networkLines[0]?.quantity ?? 0}
            onDecrease={() => { const line = networkLines[0]; if (line) updateCartItem(line.lineId, line.quantity - 1); }}
            onIncrease={() => { const line = networkLines[0]; if (line) updateCartItem(line.lineId, line.quantity + 1); else openProduct(product); }}
            label={product.name}
            increaseDisabled={cart.reduce((sum, line) => sum + line.quantity, 0) >= 100 || Boolean(networkLines[0] && networkLines[0].status !== "CURRENT")}
          />
        ) : showNetworkControl ? (
          <button type="button" className="menu-network-configure" onClick={() => openProduct(product)}
            aria-label={language === "ar" ? `اختيار تكوين جديد لـ ${product.name}` : `Choose another configuration for ${product.name}`}>
            <Plus size={14} />
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <main className="public-content">
      {!selectedCategorySlug && showCategoryLanding ? renderCategoryLanding() : (
        <>
          {contextTitle && contextProducts.length ? (
            <section className="menu-context-products">
              <ProductRail
                title={contextTitle}
                products={contextProducts}
                restaurantSlug={data.restaurant.slug}
                t={t}
                fillPlaceholders={false}
                showPrices={showPrices}
                showViewAll={false}
                onAddToCart={whatsappOrderingEnabled ? addToCart : undefined}
                networkConfigureEnabled={whatsappOrderingEnabled && showPrices && data.networkWhatsappCheckoutEnabled === true}
                returnHref={menuReturnHref}
                useSubdomainRoutes={useSubdomainRoutes}
              />
            </section>
          ) : null}

          {showNestedCategoryStrip ? <section className={`menu-category-strip category-nav-${categoryNavVariant}`} id="menu-categories" ref={categoryStripRef}>
            {headerCategories.map((category) => {
              const isAllCategory = category.slug === "all";
              const isActive = category.slug === highlightedCategorySlug;
              const productsCount = isAllCategory
                ? visibleProducts.length
                : categoryProductsSource.filter((product) => (product.category?.slug ?? product.categorySlug) === category.slug).length;

              return (
                <button
                  type="button"
                  key={category.slug}
                  className={`menu-category-chip ${isActive ? "active" : ""} ${category.visualScrollEnabled ? "visual-scroll" : ""}`}
                  data-category-slug={category.slug}
                  onClick={() => selectCategory(category.slug)}
                >
                  {categoryNavVariant !== "text-tabs" ? <span className="menu-category-icon" style={categoryChipStyle(category)}>
                    {category.imageUrl ? <img src={category.imageUrl} alt="" aria-hidden="true" /> : <LayoutGrid size={24} />}
                  </span> : null}
                  <span>{category.name}</span>
                  <small>{productsCount}</small>
                </button>
              );
            })}
          </section> : null}

          {productListLayout === "single" ? <div className="menu-view-switch" role="group" aria-label="تغيير شكل المنتجات">
            <button
              type="button"
              className={menuDisplayMode === "large" ? "active" : ""}
              onClick={() => changeMenuDisplayMode("large")}
              aria-label="عرض المنتج الكبير"
              title="عرض المنتج الكبير"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={menuDisplayMode === "list" ? "active" : ""}
              onClick={() => changeMenuDisplayMode("list")}
              aria-label="عرض المنتجات"
              title="عرض المنتجات"
            >
              <List size={16} />
            </button>
          </div> : null}

          {menuDisplayMode === "large" && spotlightProduct ? (
            <section className="category-spotlight" id="menu-products-start">
              <article
                className="category-spotlight-card"
                onPointerCancel={handleSpotlightPointerCancel}
                onPointerDown={handleSpotlightPointerDown}
                onPointerMove={handleSpotlightPointerMove}
                onPointerUp={handleSpotlightPointerEnd}
                onTouchStart={handleSpotlightTouchStart}
                onTouchEnd={handleSpotlightTouchEnd}
              >
                <button type="button" className="category-spotlight-open" onClick={() => handleSpotlightOpen(spotlightProduct)}>
                  <ProductImageMedia product={spotlightProduct} />
                </button>
                <div className="category-spotlight-copy">
                  <button type="button" className="category-spotlight-title-row" onClick={() => handleSpotlightOpen(spotlightProduct)}>
                    <b>{spotlightProduct.name}</b>
                    {showPrices ? <ProductPrice price={productPrice(spotlightProduct)} currency={spotlightProduct.currency} className="spotlight-price" priceFirst startingAt={spotlightProduct.productConfiguration?.priceDisplay === "STARTING_AT"} startingAtLabel={t.startingAt} /> : null}
                  </button>
                  <div className="category-spotlight-detail-row">
                    <button type="button" className="category-spotlight-description-open" onClick={() => handleSpotlightOpen(spotlightProduct)}>
                      {spotlightProduct.description ? <p title={spotlightProduct.description}>{spotlightProduct.description}</p> : null}
                    </button>
                    {whatsappOrderingEnabled && !isVertigo && hasLegacyOrderPrice(spotlightProduct) ? (
                      <QuantityControl
                        className="spotlight-quantity"
                        quantity={getCartQuantity(spotlightProduct.slug)}
                        onDecrease={() => setProductQuantity(spotlightProduct, getCartQuantity(spotlightProduct.slug) - 1)}
                        onIncrease={() => addToCart(spotlightProduct)}
                        label={spotlightProduct.name}
                      />
                    ) : null}
                  </div>
                </div>
              </article>
              <div className="spotlight-actions">
                <div className="spotlight-pager">
                  <button type="button" className="spotlight-arrow prev" onClick={moveSpotlightPrevious} aria-label="المنتج السابق" disabled={!canMoveSpotlightPrevious}>
                    <ChevronRight size={22} />
                  </button>
                  <button type="button" className="spotlight-arrow next" onClick={moveSpotlightNext} aria-label="المنتج التالي" disabled={!canMoveSpotlightNext}>
                    <ChevronLeft size={22} />
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {menuDisplayMode === "list" ? (
            <section className={`product-list category-product-list-${productListLayout}`} id="menu-products-start">
              {regularCategories.map((category) => {
                const products = categoryProductsSource.filter((product) => (product.category?.slug ?? product.categorySlug) === category.slug);
                if (!products.length) {
                  return null;
                }

                return (
                  <div key={category.slug} id={`category-section-${category.slug}`}>
                    <h2 className="category-section-title">
                      <span>{category.name}</span>
                    </h2>
                    <div className={productListLayout === "double" ? "menu-product-grid" : "menu-product-stack"}>
                      {products.map(renderProduct)}
                    </div>
                  </div>
                );
              })}
              {productsWithoutCategory.length ? (
                <div id="category-section-all-products">
                  <h2 className="category-section-title">
                    <span>{selectedMood || activeCategory?.name || allCategory?.name || "الكل"}</span>
                  </h2>
                  <div className={productListLayout === "double" ? "menu-product-grid" : "menu-product-stack"}>
                    {productsWithoutCategory.map(renderProduct)}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {!activeProducts.length ? (
            <div className="menu-empty-products" id={menuDisplayMode === "large" ? "menu-products-start" : undefined}>
              <b>{selectedMood || activeCategory?.name || "الكل"}</b>
              <span>لا توجد منتجات مرتبطة بهذا الخيار حالياً.</span>
            </div>
          ) : null}
        </>
      )}

      {selectedProduct ? (
        <ProductQuickViewModal
          product={selectedProduct}
          showPrices={showPrices}
          startingAtLabel={t.startingAt}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}
    </main>
  );
}

function ProductQuickViewModal({
  product,
  showPrices,
  startingAtLabel,
  onClose
}: {
  product: PublicProduct;
  showPrices: boolean;
  startingAtLabel: string;
  onClose: () => void;
}) {
  const gallery = productImages(product);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const activeImage = gallery[activeImageIndex] ?? gallery[0];

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product.slug]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function moveImage(direction: -1 | 1) {
    if (gallery.length <= 1) return;
    setActiveImageIndex((current) => (current + direction + gallery.length) % gallery.length);
  }

  return (
    <div className="product-quick-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <article className="product-quick-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="product-quick-close" onClick={onClose} aria-label="إغلاق">
          <X size={14} />
        </button>
        <div className="product-quick-photo">
          <ProductImageMedia product={product} image={activeImage} />
          {gallery.length ? <span>{activeImageIndex + 1}/{gallery.length}</span> : null}
          {gallery.length > 1 ? (
            <>
              <button type="button" className="prev" onClick={() => moveImage(-1)} aria-label="الصورة السابقة">
                <ChevronLeft size={18} />
              </button>
              <button type="button" className="next" onClick={() => moveImage(1)} aria-label="الصورة التالية">
                <ChevronRight size={18} />
              </button>
            </>
          ) : null}
        </div>
        <div className="product-quick-body">
          <div className="product-quick-title-row">
            <h2>{product.name}</h2>
            {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} priceFirst startingAt={product.productConfiguration?.priceDisplay === "STARTING_AT"} startingAtLabel={startingAtLabel} /> : null}
          </div>
          <p>{product.description}</p>
        </div>
      </article>
    </div>
  );
}

function ProductPrice({
  price,
  currency,
  className = "",
  priceFirst = false,
  startingAt = false,
  startingAtLabel = "ابتداءً من"
}: {
  price: number | string | null;
  currency: string;
  className?: string;
  priceFirst?: boolean;
  startingAt?: boolean;
  startingAtLabel?: string;
}) {
  if (price === null) {
    return <strong className={`product-price ${className}`.trim()}><span>غير متاح</span></strong>;
  }
  const formatted = displayCurrencyAmount(price, currency);
  const currencySuffix = ` ${currency}`;
  const hasCurrency = formatted.endsWith(currencySuffix);
  const amount = hasCurrency ? formatted.slice(0, -currencySuffix.length) : formatted;
  return (
    <strong className={`product-price ${className}`.trim()} dir={startingAt ? /[\u0600-\u06ff]/.test(startingAtLabel) ? "rtl" : "ltr" : undefined}>
      {startingAt ? <em>{startingAtLabel}</em> : null}
      {priceFirst || startingAt ? (
        <>
          <span dir="ltr">{amount}</span>
          {hasCurrency ? <small>{currency}</small> : null}
        </>
      ) : (
        <>
          {hasCurrency ? <small>{currency}</small> : null}
          <span>{amount}</span>
        </>
      )}
    </strong>
  );
}

function QuantityControl({
  quantity,
  onDecrease,
  onIncrease,
  label,
  className = "",
  increaseDisabled = false
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  label: string;
  className?: string;
  increaseDisabled?: boolean;
}) {
  return (
    <div className={`quantity-control ${className}`.trim()}>
      <button type="button" onClick={onIncrease} disabled={increaseDisabled} aria-label={`+ ${label}`}>
        <Plus size={14} />
      </button>
      <strong>{quantity}</strong>
      <button type="button" onClick={onDecrease} disabled={quantity <= 0} aria-label={`- ${label}`}>
        <Minus size={14} />
      </button>
    </div>
  );
}

function CartView({
  data,
  cart,
  updateCartItem,
  updateCartNote,
  removeCartItem,
  addToCart,
  sendWhatsappOrder,
  orderSubmitting,
  orderMessage,
  whatsappOrderingEnabled,
  networkWhatsappCheckoutEnabled,
  language,
  acceptNetworkPrice,
  retryNetworkLine,
  saveNetworkEdit,
  t,
  showPrices,
  useSubdomainRoutes
}: {
  data: PublicMenuData;
  cart: CartItem[];
  updateCartItem: (slug: string, quantity: number) => void;
  updateCartNote: (lineId: string, note: string) => void;
  removeCartItem: (slug: string) => void;
  addToCart: (product: PublicProduct) => void;
  sendWhatsappOrder: (details?: CheckoutDetails) => void;
  orderSubmitting: boolean;
  orderMessage: string | null;
  whatsappOrderingEnabled: boolean;
  networkWhatsappCheckoutEnabled: boolean;
  language: PublicLanguage;
  acceptNetworkPrice: (lineId: string) => Promise<NetworkCartItem | null>;
  retryNetworkLine: (lineId: string) => Promise<NetworkCartItem | null>;
  saveNetworkEdit: (product: PublicProduct, quote: PublicProductQuoteResponse, lineId: string, quantity: number, note: string) => boolean;
  t: PublicTranslations;
  showPrices: boolean;
  useSubdomainRoutes: boolean;
}) {
  const [cartStep, setCartStep] = useState<"review" | "confirm">("review");
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("pickup");
  const [deliveryArea, setDeliveryArea] = useState("");
  const [deliveryNear, setDeliveryNear] = useState("");
  const [deliveryBeside, setDeliveryBeside] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [previewCopied, setPreviewCopied] = useState(false);
  const [expandedNetworkLines, setExpandedNetworkLines] = useState<Set<string>>(() => new Set());
  const [editingNetworkLineId, setEditingNetworkLineId] = useState<string | null>(null);
  const [editingNetworkNote, setEditingNetworkNote] = useState("");
  const [invoiceExpanded, setInvoiceExpanded] = useState(false);
  const [invoiceDragActive, setInvoiceDragActive] = useState(false);
  const invoiceCardRef = useRef<HTMLElement | null>(null);
  const invoiceCollapsedHeight = useRef(0);
  const invoiceSnapTimer = useRef<number | null>(null);
  const invoiceDrag = useRef<{ pointerId: number; startY: number; lastY: number; startHeight: number;
    expandedHeight: number; startedAt: number; wasExpanded: boolean; onHandle: boolean;
    mode: "pending" | "sheet" | "scroll"; scrollElement: HTMLElement | null } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewedLineIds, setReviewedLineIds] = useState<Set<string>>(() => new Set());
  const [reviewModalLineIds, setReviewModalLineIds] = useState<string[] | null>(null);
  const networkEditorRef = useRef<HTMLElement | null>(null);
  const productBySlug = useMemo(() => new Map(data.products.map((product) => [product.slug, product])), [data.products]);
  const cartSlugs = useMemo(() => new Set(cart.map((item) => item.slug)), [cart]);
  const related = data.products.filter((product) => !cartSlugs.has(product.slug)).slice(0, 8);
  const networkItems = cart.filter((item): item is NetworkCartItem => item.mode === "NETWORK");
  const staleLegacyNetwork = cart.some((item) => {
    const product = productBySlug.get(item.slug);
    return item.mode === "LEGACY" && Boolean(product && isNetworkProduct(product));
  });
  const hasNetwork = cartNeedsPreviewGate(cart, data.products);
  // Preserve the existing persisted Legacy order flow even when Network checkout is enabled.
  const useTrustedNetworkCheckout = shouldUseTrustedWhatsappCheckout(cart, networkWhatsappCheckoutEnabled);
  const subtotal = cart.filter((item): item is LegacyCartItem => item.mode === "LEGACY")
    .map((item) => multiplyMoney(item.priceText ?? String(item.price), item.quantity));
  const legacySubtotal = sumMoney(subtotal);
  const deliveryFee = fulfillment === "delivery" ? data.restaurant.deliveryFee ?? null : null;
  const total = fulfillment === "delivery" && deliveryFee === null ? null
    : sumMoney([legacySubtotal, deliveryFee ?? "0"]);
  const trustedTotal = cartDisplayedTotal(cart);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const editingNetworkItem = cart.find((item): item is NetworkCartItem => item.mode === "NETWORK" && item.lineId === editingNetworkLineId);
  const editingNetworkProduct = editingNetworkItem ? data.products.find((product) => product.id === editingNetworkItem.productId) : undefined;

  useLayoutEffect(() => {
    const card = invoiceCardRef.current;
    if (!card || invoiceDragActive || invoiceExpanded) return;
    invoiceCollapsedHeight.current = card.getBoundingClientRect().height;
  }, [invoiceDragActive, invoiceExpanded, cart.length, fulfillment, deliveryFee]);

  useLayoutEffect(() => {
    const card = invoiceCardRef.current;
    const drag = invoiceDrag.current;
    if (!invoiceDragActive || !card || !drag) return;
    const clone = card.cloneNode(true) as HTMLElement;
    clone.classList.add("invoice-expanded");
    clone.classList.remove("invoice-dragging");
    clone.style.height = "auto";
    clone.style.maxHeight = "min(76dvh, 680px)";
    clone.style.overflow = "hidden";
    clone.style.left = "-10000px";
    clone.style.bottom = "auto";
    clone.style.top = "0";
    clone.style.transition = "none";
    card.parentElement?.appendChild(clone);
    drag.expandedHeight = Math.max(drag.startHeight, Math.min(clone.getBoundingClientRect().height, window.innerHeight * 0.76, 680));
    clone.remove();
  }, [invoiceDragActive]);

  useEffect(() => () => { if (invoiceSnapTimer.current !== null) window.clearTimeout(invoiceSnapTimer.current); }, []);

  function startInvoiceDrag(event: PointerEvent<HTMLElement>) {
    const card = invoiceCardRef.current;
    if (!card || invoiceSnapTimer.current !== null || !event.isPrimary) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const handle = target.closest(".cart-invoice-handle");
    if (!handle && target.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
    // Desktop text remains selectable; touch can drag from the invoice rows.
    if (event.pointerType === "mouse" && !handle && target.closest("dt, dd")) return;
    const height = card.getBoundingClientRect().height;
    invoiceDrag.current = { pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY,
      startHeight: height, expandedHeight: height, startedAt: performance.now(), wasExpanded: invoiceExpanded,
      onHandle: Boolean(handle), mode: "pending", scrollElement: target.closest<HTMLElement>(".cart-invoice-scroll") };
    card.style.height = `${height}px`;
    card.style.overflow = "hidden";
    card.style.transition = "none";
    card.setPointerCapture(event.pointerId);
    setInvoiceDragActive(true);
  }

  function moveInvoiceDrag(event: PointerEvent<HTMLElement>) {
    const drag = invoiceDrag.current;
    const card = invoiceCardRef.current;
    if (!drag || !card || event.pointerId !== drag.pointerId) return;
    const delta = event.clientY - drag.lastY;
    if (drag.mode === "pending" && Math.abs(event.clientY - drag.startY) > 4) {
      drag.mode = drag.wasExpanded && drag.scrollElement
        && (delta < 0 || drag.scrollElement.scrollTop > 0) ? "scroll" : "sheet";
    }
    if (drag.mode === "scroll" && drag.scrollElement) {
      if (delta > 0 && drag.scrollElement.scrollTop <= 0) {
        drag.mode = "sheet";
        drag.startY = event.clientY;
        drag.startHeight = card.getBoundingClientRect().height;
      } else {
        drag.scrollElement.scrollTop -= delta;
        drag.lastY = event.clientY;
        return;
      }
    }
    drag.lastY = event.clientY;
    if (drag.mode !== "sheet") return;
    const collapsed = invoiceCollapsedHeight.current || drag.startHeight;
    const height = Math.max(collapsed, Math.min(drag.expandedHeight, drag.startHeight + drag.startY - event.clientY));
    card.style.height = `${height}px`;
  }

  function finishInvoiceDrag(event: PointerEvent<HTMLElement>, cancelled = false) {
    const drag = invoiceDrag.current;
    const card = invoiceCardRef.current;
    if (!drag || !card || event.pointerId !== drag.pointerId) return;
    invoiceDrag.current = null;
    if (drag.mode !== "sheet") {
      card.style.height = "";
      card.style.overflow = "";
      card.style.transition = "";
      setInvoiceDragActive(false);
      if (drag.mode === "pending" && drag.onHandle && !cancelled) setInvoiceExpanded((current) => !current);
      return;
    }
    const collapsed = invoiceCollapsedHeight.current || drag.startHeight;
    const currentHeight = card.getBoundingClientRect().height;
    const distance = drag.startY - drag.lastY;
    const velocity = distance / Math.max(1, performance.now() - drag.startedAt);
    const open = cancelled ? drag.wasExpanded : Math.abs(velocity) > 0.35 && Math.abs(distance) > 22
      ? velocity > 0 : currentHeight > (collapsed + drag.expandedHeight) / 2;
    const target = open ? drag.expandedHeight : collapsed;
    setInvoiceExpanded(open);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.style.transition = reduced ? "none" : "height 180ms ease-out";
    card.style.height = `${target}px`;
    invoiceSnapTimer.current = window.setTimeout(() => {
      card.style.height = "";
      card.style.overflow = "";
      card.style.transition = "";
      setInvoiceDragActive(false);
      invoiceSnapTimer.current = null;
    }, reduced ? 0 : 190);
  }

  useEffect(() => {
    if (!editingNetworkLineId) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => networkEditorRef.current?.querySelector<HTMLButtonElement>("header button")?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [editingNetworkLineId]);
  const trustedDisabledReason = !showPrices && hasNetwork
    ? language === "ar" ? "أسعار هذه القائمة مخفية؛ لا يمكن طلب أصناف الشبكة." : "Prices are hidden for this menu; Network products cannot be ordered."
    : staleLegacyNetwork
      ? language === "ar" ? "هذا الصنف تغيّر إلى شبكة خيارات. احذفه وأضفه مجددًا." : "A product changed to Network configuration. Remove and add it again."
      : networkItems.some((item) => item.status === "CHECKING" || item.status === "INVALID" || item.status === "OFFLINE")
        ? language === "ar" ? "راجع خيارات الأصناف المتغيرة قبل إتمام الطلب." : "Review changed configurations before checkout."
        : undefined;
  const trusted = useTrustedWhatsappCheckout({ cart, restaurantSlug: data.restaurant.slug, locale: language,
    details: { customerName, customerPhone, fulfillmentType: fulfillment, deliveryArea, deliveryNear,
      deliveryBeside, pickupTime, orderNote }, disabledReason: trustedDisabledReason, displayedFee: deliveryFee });
  const displayedFee = trusted.pendingPrice ? trusted.pendingPrice.draft.deliveryFee : deliveryFee;
  const displayedItemsSubtotal = useTrustedNetworkCheckout ? trusted.pendingPrice?.draft.itemsSubtotal ?? trustedTotal : legacySubtotal;
  const displayedOrderTotal = useTrustedNetworkCheckout
    ? trusted.pendingPrice ? trusted.pendingPrice.draft.totalAmount
      : fulfillment === "delivery" && deliveryFee === null ? null : sumMoney([trustedTotal, deliveryFee ?? "0"])
    : total;
  const [orderNumber, setOrderNumber] = useState("001");

  useEffect(() => {
    if (!cart.length || hasNetwork || !whatsappOrderingEnabled) {
      setOrderNumber("001");
      return;
    }

    let cancelled = false;

    async function loadOrderNumber() {
      try {
        const response = await fetch(`${PUBLIC_API_BASE_URL}/public/menus/${encodeURIComponent(data.restaurant.slug)}/orders/next-number`);
        const payload = await response.json().catch(() => null) as { data?: { orderNumber?: string | number }; orderNumber?: string | number } | null;
        const rawOrderNumber = payload?.data?.orderNumber ?? payload?.orderNumber;
        const nextOrderNumber = typeof rawOrderNumber === "number" ? String(rawOrderNumber).padStart(3, "0") : rawOrderNumber;

        if (!cancelled && nextOrderNumber) {
          setOrderNumber(nextOrderNumber);
        }
      } catch {
        if (!cancelled) {
          setOrderNumber("001");
        }
      }
    }

    loadOrderNumber();

    return () => {
      cancelled = true;
    };
  }, [cart.length, data.restaurant.slug, hasNetwork, whatsappOrderingEnabled]);

  useEffect(() => {
    function restoreReviewStep() {
      setCartStep("review");
    }

    window.addEventListener("popstate", restoreReviewStep);
    return () => window.removeEventListener("popstate", restoreReviewStep);
  }, []);

  useEffect(() => {
    if (hasNetwork && (!useTrustedNetworkCheckout || !showPrices || !whatsappOrderingEnabled)) setCartStep("review");
  }, [hasNetwork, useTrustedNetworkCheckout, showPrices, whatsappOrderingEnabled]);

  function goToConfirmStep() {
    if ((hasNetwork && (!useTrustedNetworkCheckout || !showPrices)) || !whatsappOrderingEnabled) return;
    window.history.pushState({ cartStep: "confirm" }, "", window.location.href);
    setCartStep("confirm");
  }

  async function handleCheckoutAction() {
    if ((hasNetwork && (!useTrustedNetworkCheckout || !showPrices)) || !whatsappOrderingEnabled) {
      setCheckoutError(language === "ar" ? "إرسال هذا الطلب غير متاح حاليًا." : "This checkout is currently unavailable.");
      return;
    }
    if (cartStep === "review") {
      if (reviewBusy) return;
      if (networkItems.length) {
        setReviewBusy(true);
        const reviewed = await Promise.all(networkItems.map((item) => retryNetworkLine(item.lineId)));
        setReviewBusy(false);
        if (reviewed.some((item) => item === null)) {
          setCheckoutError(language === "ar" ? "انتظر انتهاء التحقق ثم حاول مجددًا." : "Wait for verification and try again.");
          return;
        }
        const problems = reviewed.filter((item): item is NetworkCartItem => item !== null && item.status !== "CURRENT");
        if (problems.length) {
          setReviewedLineIds(new Set(problems.filter((item) => item.status === "INVALID" || item.status === "OFFLINE").map((item) => item.lineId)));
          setReviewModalLineIds(problems.map((item) => item.lineId));
          setCheckoutError(null);
          return;
        }
      }
      setReviewedLineIds(new Set());
      setCheckoutError(null);
      goToConfirmStep();
      return;
    }

    if (fulfillment === "delivery") {
      if (!deliveryArea.trim() || !deliveryNear.trim() || !deliveryBeside.trim()) {
        setCheckoutError("يرجى تعبئة المنطقة وقريب من وجانب قبل إرسال الطلب.");
        return;
      }
    }

    setCheckoutError(null);
    if (useTrustedNetworkCheckout) {
      void trusted.submit(trustedTotal);
      return;
    }
    sendWhatsappOrder(
      fulfillment === "delivery"
        ? {
            fulfillmentType: fulfillment,
            deliveryArea,
            deliveryNear,
            deliveryBeside,
            orderNote
          }
        : {
            fulfillmentType: fulfillment,
            orderNote,
            pickupTime
          }
    );
  }

  function toggleNetworkDetails(lineId: string) {
    setExpandedNetworkLines((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
      return next;
    });
  }

  async function acceptReviewedPrices() {
    if (!reviewModalLineIds || reviewBusy) return;
    const changed = reviewModalLineIds.flatMap((lineId) => {
      const item = cart.find((candidate): candidate is NetworkCartItem => candidate.mode === "NETWORK" && candidate.lineId === lineId);
      return item?.status === "CHANGED" && item.proposedQuote ? [item] : [];
    });
    setReviewBusy(true);
    const results = await Promise.all(changed.map((item) => acceptNetworkPrice(item.lineId)));
    setReviewBusy(false);
    const remaining = reviewModalLineIds.filter((lineId) => {
      const result = results.find((item) => item?.lineId === lineId);
      if (result) return result.status !== "CURRENT";
      return cart.some((item) => item.mode === "NETWORK" && item.lineId === lineId && item.status !== "CURRENT");
    });
    setReviewedLineIds(new Set(remaining.filter((lineId) => {
      const result = results.find((item) => item?.lineId === lineId);
      const current = result ?? cart.find((item): item is NetworkCartItem => item.mode === "NETWORK" && item.lineId === lineId);
      return current?.status === "INVALID" || current?.status === "OFFLINE";
    })));
    setReviewModalLineIds(remaining.length ? remaining : null);
  }

  const reviewModalItems = reviewModalLineIds?.flatMap((lineId) => {
    const item = cart.find((candidate): candidate is NetworkCartItem => candidate.mode === "NETWORK" && candidate.lineId === lineId);
    return item ? [item] : [];
  }) ?? [];

  return (
    <main className={`cart-page ${showPrices ? "" : "prices-hidden"}`}>
      <CheckoutSteps active={cartStep} />

      {cartStep === "review" ? (
        <>
          {cart.length ? (
            <section className="cart-page-list">
              {cart.map((item) => {
                const product = productBySlug.get(item.slug);
                const imageUrl = item.imageUrl ?? (product ? productImage(product) : null);
                const ingredientNames = product
                  ? productIngredients(product).map((ingredient) => ingredient.name).filter(Boolean).join(" - ")
                  : "";
                const choiceLabels = item.mode === "NETWORK" ? networkCartChoiceLabels(item.acceptedQuote.priceBreakdown) : [];
                const hasSizeChoice = item.mode === "NETWORK" && item.acceptedQuote.priceBreakdown.some((line) => line.kind === "SIZE");

                return (
                  <article key={item.lineId} className={`cart-page-item ${item.mode === "NETWORK" ? "network-cart-item" : ""} ${item.mode === "NETWORK" && (choiceLabels.length || hasSizeChoice || reviewedLineIds.has(item.lineId)) ? "has-network-details" : ""} ${item.mode === "NETWORK" && reviewedLineIds.has(item.lineId) && (item.status === "INVALID" || item.status === "OFFLINE") ? "network-cart-needs-review" : ""}`}>
                    {imageUrl ? <img src={imageUrl} alt={item.name} /> : (
                      <span className="product-image-placeholder" role="img" aria-label={item.name}>
                        <ImageIcon size={24} />
                      </span>
                    )}
                    <div className="cart-page-copy">
                      <b dir="auto">{item.mode === "NETWORK" ? networkCartHeading(item) : item.name}</b>
                      {item.mode === "NETWORK" ? <>
                        {showPrices ? <ProductPrice price={multiplyMoney(item.acceptedQuote.total, item.quantity)} currency={item.currency} /> : null}
                      </> : <>
                        {ingredientNames ? <p dir="auto" title={ingredientNames}>{ingredientNames}</p> : null}
                        {showPrices ? <ProductPrice price={multiplyMoney(item.priceText ?? String(item.price), item.quantity)} currency={item.currency} /> : null}
                      </>}
                    </div>
                    <div className="cart-page-stepper" aria-label={item.name}>
                      <button type="button" onClick={() => updateCartItem(item.lineId, item.quantity + 1)} disabled={hasNetwork && cartCount >= 100} aria-label={`+ ${item.name}`}>
                        <Plus size={14} />
                      </button>
                      <strong>{item.quantity}</strong>
                      <button type="button" onClick={() => updateCartItem(item.lineId, item.quantity - 1)} aria-label={`- ${item.name}`}>
                        <Minus size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="cart-page-remove"
                      onClick={() => removeCartItem(item.lineId)}
                      aria-label={`${t.removeItem} ${item.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                    {item.mode === "NETWORK" && (choiceLabels.length || hasSizeChoice || reviewedLineIds.has(item.lineId)) ? <div className="cart-card-configuration">
                      {choiceLabels.length || hasSizeChoice ? <div className="network-cart-tools">
                        {data.products.some((candidate) => candidate.id === item.productId) ? <button type="button" className="network-cart-edit"
                          onClick={() => { setEditingNetworkLineId(item.lineId); setEditingNetworkNote(item.note ?? ""); }}
                          aria-label={language === "ar" ? `تعديل تكوين ${item.name}` : `Edit ${item.name} choices`}><Pencil size={15} />{language === "ar" ? "تعديل" : "Edit"}</button> : null}
                        {choiceLabels.length ? <span className="network-cart-choice-summary" dir="auto">{choiceLabels.slice(0, 2).map((choice) => choice.label).join(" • ")}</span> : null}
                        {choiceLabels.length ? <button type="button" className="network-cart-expand"
                          onClick={() => toggleNetworkDetails(item.lineId)} aria-expanded={expandedNetworkLines.has(item.lineId)}
                          aria-controls={`network-cart-details-${item.lineId}`}
                          aria-label={language === "ar" ? `${expandedNetworkLines.has(item.lineId) ? "إخفاء" : "عرض"} تفاصيل ${item.name}` : `${expandedNetworkLines.has(item.lineId) ? "Hide" : "Show"} ${item.name} choices`}>
                          <ChevronDown size={18} /></button> : null}
                      </div> : null}
                      <NetworkCartDetails item={item} language={language}
                        expanded={expandedNetworkLines.has(item.lineId)} reviewed={reviewedLineIds.has(item.lineId)} />
                    </div> : null}
                    <label className="cart-item-note cart-card-note">
                      <MessageCircle size={18} aria-hidden="true" />
                      <input value={item.note ?? ""} maxLength={500} onChange={(event) => updateCartNote(item.lineId, event.target.value)}
                        placeholder={language === "ar" ? "إضافة ملاحظة" : "Add a note"}
                        aria-label={language === "ar" ? `ملاحظة ${item.name}` : `Note for ${item.name}`} />
                    </label>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="cart-empty">
              <ShoppingBag size={34} />
              <b>{t.emptyCart}</b>
              <Link href={restaurantPath(data.restaurant.slug, "/menu", useSubdomainRoutes)}>{t.menu}</Link>
            </section>
          )}

          <ProductRail
            title={t.youMayLike}
            products={related}
            restaurantSlug={data.restaurant.slug}
            t={t}
            fillPlaceholders={false}
            showPrices={showPrices}
            onAddToCart={addToCart}
            networkConfigureEnabled={whatsappOrderingEnabled && showPrices && networkWhatsappCheckoutEnabled}
            showViewAll={false}
            returnHref={restaurantPath(data.restaurant.slug, "/cart", useSubdomainRoutes)}
            useSubdomainRoutes={useSubdomainRoutes}
          />
        </>
      ) : (
        <section className={`cart-confirm-form ${fulfillment === "pickup" ? "pickup-mode" : "delivery-mode"}`}>
          {useTrustedNetworkCheckout ? <>
            <label><span>{language === "ar" ? "اسم الزبون (اختياري)" : "Customer name (optional)"}</span>
              <input value={customerName} maxLength={120} onChange={(event) => setCustomerName(event.target.value)} /></label>
            <label><span>{language === "ar" ? "الهاتف (اختياري)" : "Phone (optional)"}</span>
              <input value={customerPhone} maxLength={40} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
          </> : null}
          <div className="fulfillment-toggle">
            <button type="button" className={fulfillment === "delivery" ? "active" : ""} onClick={() => setFulfillment("delivery")}>
              <Truck size={18} />
              {useTrustedNetworkCheckout && language === "en" ? "Delivery" : "توصيل دليفري"}
            </button>
            <button type="button" className={fulfillment === "pickup" ? "active" : ""} onClick={() => setFulfillment("pickup")}>
              <ShoppingBag size={18} />
              {useTrustedNetworkCheckout && language === "en" ? "Pickup from restaurant" : "استلام من المطعم"}
            </button>
          </div>
          {cartStep === "confirm" && fulfillment === "delivery" ? (
            <>
              <label>
                <span>{useTrustedNetworkCheckout && language === "en" ? "Area" : "المنطقة"}</span>
                <input value={deliveryArea} onChange={(event) => setDeliveryArea(event.target.value)} placeholder="حلب الجديدة" />
              </label>
              <label>
                <span>{useTrustedNetworkCheckout && language === "en" ? "Near" : "قريب من"}</span>
                <input value={deliveryNear} onChange={(event) => setDeliveryNear(event.target.value)} placeholder="مشفى الشهباء" />
              </label>
              <label>
                <span>{useTrustedNetworkCheckout && language === "en" ? "Address details" : "جانب"}</span>
                <input value={deliveryBeside} onChange={(event) => setDeliveryBeside(event.target.value)} placeholder="صيدلية باسل" />
              </label>
              <label>
                <span>{useTrustedNetworkCheckout && language === "en" ? "Order note" : "ملاحظة للطلب"}</span>
                <input value={orderNote} onChange={(event) => setOrderNote(event.target.value)} placeholder="ملاحظة" />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>{useTrustedNetworkCheckout && language === "en" ? "Order note" : "ملاحظة"}</span>
                <input value={orderNote} onChange={(event) => setOrderNote(event.target.value)} placeholder="ملاحظة" />
              </label>
              <label>
                <span>{useTrustedNetworkCheckout && language === "en" ? "Pickup time" : "وقت الاستلام"}</span>
                <input value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} placeholder="اسرع وقت" />
              </label>
            </>
          )}
          {useTrustedNetworkCheckout ? <button type="button" className="cart-message-preview-open"
            disabled={trusted.busy || Boolean(trustedDisabledReason)} onClick={() => { setPreviewCopied(false); void trusted.preview(); }}>
            {language === "ar" ? "معاينة رسالة WhatsApp دون إرسال" : "Preview WhatsApp message without sending"}
          </button> : null}
        </section>
      )}

      {hasNetwork && (!useTrustedNetworkCheckout || !showPrices) ? <section className="network-cart-gate" role="status">
        <b>{language === "ar" ? "سلة الشبكة للمعاينة فقط" : "Network cart is preview-only"}</b>
        {staleLegacyNetwork ? <p>{language === "ar" ? "يوجد صنف محفوظ بصيغة السلة القديمة وأصبح يستخدم الشبكة. لم نحوله تلقائيًا؛ احذفه وأضفه بتكوين جديد قبل أي طلب." : "A saved legacy line now uses Network configuration. It was not converted; remove it and add a newly configured line."}</p> : null}
        {!showPrices ? <p>{trustedDisabledReason}</p> : null}
        {reviewedLineIds.size && networkItems.some((item) => item.status !== "CURRENT") ? <p>{language === "ar" ? "توجد عناصر تحتاج مراجعة أو اتصالًا بالخادم؛ لم تُعدل اختياراتك تلقائيًا." : "Some items need review or server access; selections were not changed automatically."}</p> : null}
      </section> : whatsappOrderingEnabled ? <section ref={invoiceCardRef} className={`cart-checkout-card ${invoiceExpanded ? "invoice-expanded" : ""} ${invoiceDragActive ? "invoice-dragging" : ""}`}
        onPointerDown={startInvoiceDrag} onPointerMove={moveInvoiceDrag}
        onPointerUp={finishInvoiceDrag} onPointerCancel={(event) => finishInvoiceDrag(event, true)}
        onLostPointerCapture={(event) => finishInvoiceDrag(event, true)}>
        <button type="button" className="cart-invoice-handle" aria-label={language === "ar" ? invoiceExpanded ? "تصغير ملخص الفاتورة" : "توسيع ملخص الفاتورة" : invoiceExpanded ? "Collapse invoice" : "Expand invoice"}
          aria-expanded={invoiceExpanded}
          onClick={(event) => { if (event.detail === 0) setInvoiceExpanded((current) => !current); }}>
          <span />
        </button>
        {invoiceExpanded && !hasNetwork ? <div className="cart-checkout-meta"><span>{t.orderNumber}: {orderNumber}</span></div> : null}
        <div className="cart-invoice-scroll" aria-label={language === "ar" ? "تفاصيل الفاتورة" : "Invoice details"}>
        {invoiceExpanded || invoiceDragActive ? <dl className="cart-invoice-lines">
          {cart.map((item) => {
            const heading = item.mode === "NETWORK" ? networkCartHeading(item) : item.name;
            const matching = cart.filter((line) => line.mode === "NETWORK" && networkCartHeading(line) === heading);
            const suffix = item.mode === "NETWORK" && matching.length > 1
              ? ` (${language === "ar" ? "تكوين" : "configuration"} ${matching.findIndex((line) => line.lineId === item.lineId) + 1})` : "";
            const amount = item.mode === "NETWORK" ? multiplyMoney(item.acceptedQuote.total, item.quantity)
              : multiplyMoney(item.priceText ?? String(item.price), item.quantity);
            return <div key={item.lineId} className="cart-invoice-line"><dt dir="auto">{item.quantity} × {heading}{suffix}</dt>
              <dd>{displayCurrencyAmount(amount, item.currency)}</dd></div>;
          })}
        </dl> : null}
        <dl className="cart-invoice-totals">
          <div>
            <dt>{t.subtotal}</dt>
            <dd>{displayCurrencyAmount(displayedItemsSubtotal, data.restaurant.currency ?? "ل.س")}</dd>
          </div>
          {fulfillment === "delivery" || (!invoiceExpanded && !invoiceDragActive) ? (
          <div>
              <dt>{t.deliveryFee}</dt>
              <dd>{fulfillment === "pickup" ? language === "ar" ? "لا تُضاف للاستلام" : "Not charged for pickup"
                : displayedFee === null ? language === "ar" ? "تُحدّد حسب المنطقة" : "Determined by area"
                : displayedFee === "0" ? language === "ar" ? "مجاني" : "Free"
                : displayCurrencyAmount(displayedFee, data.restaurant.currency ?? "ل.س")}</dd>
          </div>
          ) : null}
          <div>
            <dt>{t.total}</dt>
            <dd>{displayedOrderTotal === null
              ? language === "ar" ? "يُحدّد بعد رسوم التوصيل" : "Pending delivery fee"
              : displayCurrencyAmount(displayedOrderTotal, data.restaurant.currency ?? "ل.س")}</dd>
          </div>
        </dl>
        </div>
        {checkoutError ? <p className="cart-message">{checkoutError}</p> : null}
        {useTrustedNetworkCheckout && trustedDisabledReason && !networkItems.some((item) => item.status !== "CURRENT") ? <p className="cart-message">{trustedDisabledReason}</p> : null}
        {useTrustedNetworkCheckout && trusted.error ? <p className="cart-message" role="alert">{trusted.error}</p> : null}
        {orderMessage ? <p className="cart-message">{orderMessage}</p> : null}
        <button
          type="button"
          className="cart-whatsapp"
          onClick={handleCheckoutAction}
          disabled={!cart.length || orderSubmitting || trusted.busy || reviewBusy || (useTrustedNetworkCheckout && Boolean(trustedDisabledReason) && cartStep !== "review")}
        >
          {orderSubmitting || trusted.busy || reviewBusy ? <Loader2 size={18} className="spin" /> : <ShoppingBag size={18} />}
          {orderSubmitting || trusted.busy || reviewBusy ? t.preparingOrder : cartStep === "review" ? "التالي" : t.sendViaWhatsapp}
        </button>
      </section> : <section className="network-cart-gate" role="status">{language === "ar" ? "إرسال الطلب غير متاح لهذه القائمة حاليًا." : "Ordering is unavailable for this menu."}</section>}
      {reviewModalLineIds && reviewModalItems.length ? <div className="network-review-backdrop" role="presentation">
        <section className="network-review-dialog" role="dialog" aria-modal="true" aria-labelledby="network-review-title" dir={language === "ar" ? "rtl" : "ltr"}>
          <h2 id="network-review-title">{language === "ar" ? "مراجعة الأصناف" : "Review items"}</h2>
          <p>{language === "ar" ? "تغيّرت بعض الأصناف. راجعها قبل المتابعة؛ لم نغيّر اختياراتك تلقائيًا." : "Some items changed. Review them before continuing; your choices were not changed automatically."}</p>
          <ul>{reviewModalItems.map((item) => <li key={item.lineId}>
            <b dir="auto">{item.name}</b>
            {item.status === "CHANGED" && item.proposedQuote ? <p>{language === "ar" ? "السعر السابق" : "Previous price"}: {displayCurrencyAmount(multiplyMoney(item.acceptedQuote.total, item.quantity), item.currency)}<br />
              {language === "ar" ? "السعر الحالي" : "Current price"}: {displayCurrencyAmount(multiplyMoney(item.proposedQuote.total, item.quantity), item.currency)}</p>
              : <p>{item.status === "OFFLINE"
                ? language === "ar" ? "تعذر الاتصال بالخادم؛ حاول مجددًا." : "Could not reach the server; try again."
                : networkReviewIssueLabel(item.issues[0]?.code, language)}</p>}
            {item.status === "INVALID" && data.products.some((product) => product.id === item.productId) ? <button type="button" onClick={() => {
              setEditingNetworkLineId(item.lineId); setEditingNetworkNote(item.note ?? ""); setReviewModalLineIds(null);
            }}>{language === "ar" ? "تعديل الصنف" : "Edit item"}</button> : null}
          </li>)}</ul>
          <div className="network-review-actions">
            <button type="button" onClick={() => setReviewModalLineIds(null)}>{language === "ar" ? "العودة للسلة" : "Back to cart"}</button>
            {reviewModalItems.some((item) => item.status === "CHANGED" && item.proposedQuote) ? <button type="button" disabled={reviewBusy} onClick={() => void acceptReviewedPrices()}>
              {language === "ar" ? "أوافق على الأسعار الحالية" : "Accept current prices"}</button> : null}
          </div>
        </section>
      </div> : null}
      {trusted.previewMessage ? <div className="whatsapp-preview-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) trusted.closePreview();
      }}><section className="whatsapp-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="whatsapp-preview-title"
        dir={language === "ar" ? "rtl" : "ltr"} onKeyDown={(event) => { if (event.key === "Escape") trusted.closePreview(); }}>
        <header><h2 id="whatsapp-preview-title">{language === "ar" ? "معاينة رسالة WhatsApp" : "WhatsApp message preview"}</h2>
          <button type="button" onClick={trusted.closePreview} aria-label={language === "ar" ? "إغلاق المعاينة" : "Close preview"}><X size={20} /></button></header>
        {trusted.previewPriceChanged ? <p role="alert">{language === "ar" ? "تغير السعر. هذه معاينة للسعر الحالي فقط؛ يلزم قبول السعر الجديد قبل الإرسال." : "The price changed. This previews the current price only; you must accept it before sending."}</p> : null}
        <p>{language === "ar" ? "هذه رسالة نصية فقط. المعاينة لا تنشئ طلبًا ولا تفتح WhatsApp." : "Plain text only. Preview does not create an order or open WhatsApp."}</p>
        <pre dir="auto">{trusted.previewMessage}</pre>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(trusted.previewMessage ?? "").then(() => setPreviewCopied(true)); }}>
          {previewCopied ? language === "ar" ? "تم النسخ" : "Copied" : language === "ar" ? "نسخ النص" : "Copy text"}
        </button>
      </section></div> : null}
      {trusted.pendingPrice ? <div className="price-update-backdrop" role="presentation">
        <div className="price-update-dialog" role="dialog" aria-modal="true" aria-labelledby="price-update-title" dir={language === "ar" ? "rtl" : "ltr"}
          onKeyDown={(event) => { if (event.key === "Escape") { trusted.dismissUpdatedPrice(); setCartStep("review"); } }}>
          <h2 id="price-update-title">{language === "ar" ? "تم تحديث الأسعار" : "Prices have been updated"}</h2>
          <p>{language === "ar" ? "راجع الإجمالي الجديد قبل المتابعة." : "Review the new total before continuing."}</p>
          <ul>{trusted.pendingPrice.draft.items.map((line) => <li key={line.lineId}><span dir="auto">{line.productName} × {line.quantity}</span><b>{displayCurrencyAmount(line.lineTotal, trusted.pendingPrice!.draft.currency)}</b></li>)}</ul>
          <strong>{language === "ar" ? "الإجمالي الجديد" : "New total"}: {trusted.pendingPrice.draft.totalAmount === null
            ? language === "ar" ? "يُحدّد بعد رسوم التوصيل" : "Pending delivery fee"
            : displayCurrencyAmount(trusted.pendingPrice.draft.totalAmount, trusted.pendingPrice.draft.currency)}</strong>
          <div className="price-update-actions">
            <button type="button" autoFocus onClick={() => { trusted.dismissUpdatedPrice(); setCartStep("review"); }}>{language === "ar" ? "العودة لمراجعة السلة" : "Review cart"}</button>
            <button type="button" disabled={trusted.busy} onClick={() => void trusted.acceptUpdatedPrice()}>{language === "ar" ? "أوافق وأفتح WhatsApp" : "Accept and open WhatsApp"}</button>
          </div>
        </div>
      </div> : null}
      {editingNetworkItem && editingNetworkProduct ? <div className="network-cart-editor-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setEditingNetworkLineId(null);
      }}>
        <section ref={networkEditorRef} role="dialog" aria-modal="true" aria-labelledby="network-cart-editor-title" className="network-cart-editor"
          dir={language === "ar" ? "rtl" : "ltr"} onKeyDown={(event) => {
            if (event.key === "Escape") { setEditingNetworkLineId(null); return; }
            if (event.key !== "Tab") return;
            const buttons = Array.from(networkEditorRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href]") ?? []);
            if (!buttons.length) return;
            if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
            else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
          }}>
          <header><h2 id="network-cart-editor-title" dir="auto">{editingNetworkItem.name}</h2>
            <button type="button" onClick={() => setEditingNetworkLineId(null)} aria-label={language === "ar" ? "إلغاء التعديل" : "Cancel editing"}><X size={20} /></button></header>
          <label className="cart-item-note"><span>{language === "ar" ? "ملاحظة الصنف" : "Item note"}</span>
            <input value={editingNetworkNote} maxLength={500} onChange={(event) => setEditingNetworkNote(event.target.value)} /></label>
          <ProductConfigurator key={editingNetworkItem.lineId} restaurantSlug={data.restaurant.slug}
            productId={editingNetworkItem.productId} currency={editingNetworkItem.currency}
            initialSelection={editingNetworkItem.selection} editingLineId={editingNetworkItem.lineId}
            initialQuantity={editingNetworkItem.quantity} maxQuantity={Math.max(0, 100 - cartCount + editingNetworkItem.quantity)}
            onNetworkQuote={(quote, lineId, quantity) => {
              if (!lineId || !quantity) return false;
              const saved = saveNetworkEdit(editingNetworkProduct, quote, lineId, quantity, editingNetworkNote);
              if (saved) {
                setReviewedLineIds((current) => { const next = new Set(current); next.delete(lineId); return next; });
                setReviewModalLineIds(null);
                setEditingNetworkLineId(null);
              }
              return saved;
            }} checkoutEnabled={networkWhatsappCheckoutEnabled} orderingEnabled={whatsappOrderingEnabled && networkWhatsappCheckoutEnabled && showPrices}
            showPrices={showPrices} locale={language} />
          <button type="button" className="network-cart-editor-cancel" onClick={() => setEditingNetworkLineId(null)}>{language === "ar" ? "إلغاء" : "Cancel"}</button>
        </section>
      </div> : null}
    </main>
  );
}

function networkReviewIssueLabel(code: string | undefined, language: PublicLanguage) {
  const ar = language === "ar";
  switch (code) {
    case "CONFIGURATION_REVISION_CHANGED":
    case "STALE_CONFIGURATION_REVISION": return ar ? "تغيّر تكوين الصنف؛ حدّث اختياراته." : "The product configuration changed; update its choices.";
    case "OPTION_UNAVAILABLE": return ar ? "أحد الخيارات المختارة لم يعد متاحًا." : "A selected option is no longer available.";
    case "LINKED_PRODUCT_UNAVAILABLE": return ar ? "أحد الأصناف المرتبطة لم يعد متاحًا." : "A linked product is no longer available.";
    case "GROUP_MIN_NOT_MET": return ar ? "أكمل الخيارات المطلوبة." : "Complete the required choices.";
    case "OPTION_MAX_EXCEEDED": return ar ? "قلّل كمية أحد الخيارات." : "Reduce an option quantity.";
    case "PRODUCT_UNAVAILABLE": return ar ? "الصنف غير متاح حاليًا." : "The product is currently unavailable.";
    default: return ar ? "راجع اختيارات هذا الصنف." : "Review this product's choices.";
  }
}

function NetworkCartDetails({
  item, language, expanded, reviewed
}: {
  item: NetworkCartItem;
  language: PublicLanguage;
  expanded: boolean;
  reviewed: boolean;
}) {
  const ar = language === "ar";
  const lines = item.acceptedQuote.priceBreakdown;
  return <div className="network-cart-details" dir={ar ? "rtl" : "ltr"}>
    <div id={`network-cart-details-${item.lineId}`} className="network-cart-expanded" hidden={!expanded}>
    <ul className="network-cart-selections">
      {networkCartChoiceLabels(lines).map((line, index) => <li key={`${line.label}-${index}`} className={line.nested ? "network-cart-nested-choice" : undefined}>
        <span dir="auto">{line.label}</span>
      </li>)}
    </ul>
    {item.note?.trim() ? <p className="network-cart-note" dir="auto">{ar ? "ملاحظة:" : "Note:"} {item.note}</p> : null}
    </div>
    {reviewed && (item.status === "INVALID" || item.status === "OFFLINE") ? <p className="network-cart-status status-invalid" role="alert">
      {ar ? "راجع اختيارات هذا الصنف" : "Review this product's choices"}
    </p> : null}
  </div>;
}

function CheckoutSteps({ active }: { active: "review" | "confirm" }) {
  const steps = [
    { number: 1, label: "إنشاء طلب" },
    { number: 2, label: "تفقد السلة" },
    { number: 3, label: "التحقق" }
  ];
  const activeNumber = active === "review" ? 2 : 3;

  return (
    <section className="checkout-steps" aria-label="خطوات الطلب">
      {steps.map((step) => (
        <div key={step.number} className={step.number <= activeNumber ? "active" : ""}>
          <b>{step.number}</b>
          <span>{step.label}</span>
        </div>
      ))}
    </section>
  );
}

function ProductView({
  data,
  product,
  addToCart,
  setProductQuantity,
  getCartQuantity,
  cartCount,
  cart,
  onNetworkQuote,
  t,
  language,
  showPrices,
  whatsappOrderingEnabled,
  networkWhatsappCheckoutEnabled,
  navigateTo,
  useSubdomainRoutes
}: {
  data: PublicMenuData;
  product: PublicProduct;
  addToCart: (product: PublicProduct) => void;
  setProductQuantity: (product: PublicProduct, quantity: number) => void;
  getCartQuantity: (slug: string) => number;
  cartCount: number;
  cart: CartItem[];
  onNetworkQuote: (quote: PublicProductQuoteResponse, editingLineId?: string, quantity?: number) => boolean;
  t: PublicTranslations;
  language: PublicLanguage;
  showPrices: boolean;
  whatsappOrderingEnabled: boolean;
  networkWhatsappCheckoutEnabled: boolean;
  navigateTo: (href: string) => void;
  useSubdomainRoutes: boolean;
}) {
  const searchParams = useSearchParams();
  const editingLineId = searchParams.get("editCart") ?? undefined;
  const editingItem = editingLineId
    ? cart.find((item): item is NetworkCartItem => item.mode === "NETWORK" && item.lineId === editingLineId && item.productId === product.id)
    : undefined;
  const related = getRelatedProducts(data.products, product);
  const isVertigo = publicTemplate(data) === "vertigo";
  const ingredients = productIngredients(product);
  const mealDetails = productMealDetails(product, t);
  const model3dUrl = product.media?.model3dUrl ?? null;
  const model3dFormat = product.media?.model3dFormat?.toUpperCase() ?? null;
  const canRenderModel = Boolean(model3dUrl && model3dFormat !== "USDZ");
  const gallery = productImages(product);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [mediaMode, setMediaMode] = useState<ProductMediaMode>("image");
  const activeImage = gallery[activeImageIndex] ?? gallery[0];
  const sourceReturnHref = safeInternalHref(searchParams.get("from"));
  const productReturnHref = sourceReturnHref ?? restaurantPath(data.restaurant.slug, "/", useSubdomainRoutes);
  const currentProductHref = productHref(data.restaurant.slug, product, productReturnHref, useSubdomainRoutes);
  const touchStartX = useRef<number | null>(null);
  const quantity = getCartQuantity(product.slug);

  useEffect(() => {
    setActiveImageIndex(0);
    setMediaMode("image");
  }, [product.slug]);

  useEffect(() => {
    if (!model3dUrl || !canRenderModel || document.querySelector("script[data-model-viewer]")) {
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";
    script.dataset.modelViewer = "true";
    document.head.appendChild(script);
  }, [canRenderModel, model3dUrl]);

  useEffect(() => {
    if (!product?.slug) return;
    if (!shouldTrackProductView(data.restaurant.slug, product.slug)) return;

    void fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}/public/menus/${data.restaurant.slug}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "PRODUCT_VIEWED",
        path: `/m/${data.restaurant.slug}/product/${product.slug}`,
        metadata: { productId: product.id, productSlug: product.slug }
      })
    }).catch(() => undefined);
  }, [data.restaurant.slug, product.id, product.slug]);

  async function trackMediaOpen() {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}/public/menus/${data.restaurant.slug}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "THREE_D_VIEW_OPENED",
          path: `/m/${data.restaurant.slug}/product/${product.slug}`,
          metadata: { productSlug: product.slug }
        })
      });
    } catch {
      // Tracking must not interrupt the public menu.
    }
  }

  function moveImage(direction: -1 | 1) {
    if (gallery.length <= 1) return;
    setMediaMode("image");
    setActiveImageIndex((current) => (current + direction + gallery.length) % gallery.length);
  }

  function handleGalleryTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleGalleryTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || mediaMode !== "image") return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    moveImage(deltaX > 0 ? -1 : 1);
  }

  function openAr() {
    setMediaMode("3d");
    void trackMediaOpen();
    window.requestAnimationFrame(() => {
      const viewer = document.querySelector(".product-model-stage model-viewer") as (HTMLElement & { activateAR?: () => void }) | null;
      viewer?.activateAR?.();
    });
  }

  return (
    <main className={`product-detail ${isVertigo ? "vertigo-product-detail" : ""}`.trim()}>
      {isVertigo ? (
        <div className="vertigo-product-header">
          {data.restaurant.logoUrl ? (
            <img src={data.restaurant.logoUrl} alt={data.restaurant.name} />
          ) : (
            <span className="public-logo-fallback">{data.restaurant.name.charAt(0).toUpperCase()}</span>
          )}
          <p dir="auto">{data.restaurant.name}</p>
          <button
            type="button"
            onClick={() => sourceReturnHref ? navigateTo(sourceReturnHref) : navigateBack(productReturnHref, navigateTo)}
            aria-label="ط§ظ„ط±ط¬ظˆط¹"
          >
            <svg className="product-back-arrow-icon" viewBox="0 0 24 20" aria-hidden="true">
              <path d="M9 3.5 15.5 10 9 16.5" />
            </svg>
          </button>
        </div>
      ) : null}
      <div className="product-photo" onTouchStart={handleGalleryTouchStart} onTouchEnd={handleGalleryTouchEnd}>
        {model3dUrl ? (
          <div className="product-media-tabs" role="group" aria-label={t.photos}>
            {!isVertigo ? (
              <button
                type="button"
                className={mediaMode === "image" ? "active" : ""}
                onClick={() => setMediaMode("image")}
              >
                <ImageIcon size={16} />
                {t.photo}
              </button>
            ) : null}
            {model3dUrl ? (
              <button
                type="button"
                className={mediaMode === "3d" ? "active" : ""}
                onClick={() => {
                  setMediaMode("3d");
                  void trackMediaOpen();
                }}
              >
                <Rotate3D size={16} />
                3D
              </button>
            ) : null}
            {model3dUrl && canRenderModel ? (
              <button type="button" className="product-ar-tab" onClick={openAr}>
                AR
              </button>
            ) : null}
          </div>
        ) : null}
        {mediaMode === "3d" && model3dUrl ? (
          canRenderModel ? (
            <div className="product-model-stage">
              {createElement("model-viewer", {
                src: model3dUrl,
                ar: true,
                "ar-modes": "quick-look scene-viewer webxr",
                "camera-controls": true,
                "auto-rotate": true,
                "camera-orbit": "0deg 72deg auto",
                "min-camera-orbit": "auto 18deg auto",
                "max-camera-orbit": "auto 92deg auto",
                "interaction-prompt": "auto",
                "shadow-intensity": "1",
                loading: "lazy",
                style: { width: "100%", height: "100%", display: "block" }
              })}
            </div>
          ) : (
            <div className="product-model-stage product-model-fallback">
              <ProductImageMedia product={product} image={activeImage} />
              <a href={model3dUrl} rel="ar">
                {activeImage ? <img src={activeImage.url} alt="" aria-hidden="true" /> : null}
                فتح 3D على الآيفون
              </a>
            </div>
          )
        ) : (
          <ProductImageMedia product={product} image={activeImage} />
        )}
        <button
          type="button"
          className="product-back-link"
          onClick={() => sourceReturnHref ? navigateTo(sourceReturnHref) : navigateBack(productReturnHref, navigateTo)}
          aria-label="الرجوع"
        >
          <svg className="product-back-arrow-icon" viewBox="0 0 24 20" aria-hidden="true">
            <path d="M9 3.5 15.5 10 9 16.5" />
          </svg>
        </button>
        {mediaMode === "image" && gallery.length > 1 && !isVertigo ? (
          <>
            <button type="button" className="product-gallery-arrow product-gallery-prev" onClick={() => moveImage(-1)} aria-label="Previous image">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="product-gallery-arrow product-gallery-next" onClick={() => moveImage(1)} aria-label="Next image">
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
        {mediaMode === "image" && gallery.length ? <span>{activeImageIndex + 1}/{gallery.length}</span> : null}
      </div>
      {isVertigo && mediaMode === "image" && gallery.length > 1 ? (
        <div className="vertigo-product-dots" aria-label={t.photos}>
          {gallery.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              className={index === activeImageIndex ? "active" : ""}
              onClick={() => setActiveImageIndex(index)}
              aria-label={`${t.photo} ${index + 1}`}
            />
          ))}
        </div>
      ) : null}
      <section className="product-sheet">
        <div className="product-title-row">
          <h1>{product.name}</h1>
          {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} priceFirst startingAt={product.productConfiguration?.priceDisplay === "STARTING_AT"} startingAtLabel={t.startingAt} /> : null}
        </div>
        <p className="product-description" title={product.description ?? undefined}>{product.description}</p>

        {ingredients.length ? (
          <>
            <h2>
              {isVertigo ? null : <Flame size={18} />}
              {t.mealIncludes}
            </h2>
            <div className="ingredients-row">
              {ingredients.map((ingredient, index) => (
                <span className={`ingredient-chip ${ingredient.imageUrl ? "has-image" : "text-only"}`} key={`${ingredient.name}-${index}`}>
                  <div className="ingredient-image-card">
                    {ingredient.imageUrl ? <img src={ingredient.imageUrl} alt={ingredient.name} /> : null}
                  </div>
                  <b>{ingredient.name}</b>
                </span>
              ))}
            </div>
          </>
        ) : null}

        {mealDetails.length ? (
          <>
            <h2>
              {isVertigo ? null : <Flame size={18} />}
              {t.mealDetails}
            </h2>
            <div className="nutrition-card">
              {mealDetails.map((detail, index) => {
                const DetailIcon = mealDetailIcon(detail.icon);

                return (
                  <span key={detail.label + "-" + index}>
                    <i aria-hidden="true">
                      {detail.iconUrl ? <img src={detail.iconUrl} alt="" /> : <DetailIcon size={19} />}
                    </i>
                    <small>{detail.label}</small>
                    <b>{detail.value}</b>
                  </span>
                );
              })}
            </div>
          </>
        ) : null}

        {isNetworkProduct(product) && product.id ? (
          <ProductConfigurator
            restaurantSlug={data.restaurant.slug}
            productId={product.id}
            currency={product.currency}
            cartHref={restaurantPath(data.restaurant.slug, "/cart", useSubdomainRoutes)}
            initialSelection={editingItem?.selection}
            editingLineId={editingItem?.lineId}
            initialQuantity={editingItem?.quantity}
            maxQuantity={Math.max(0, 100 - cartCount + (editingItem?.quantity ?? 0))}
            cartCount={cartCount}
            onNetworkQuote={onNetworkQuote}
            checkoutEnabled={networkWhatsappCheckoutEnabled}
            orderingEnabled={whatsappOrderingEnabled && networkWhatsappCheckoutEnabled && showPrices}
            showPrices={showPrices}
            locale={language}
            showBottomBar={!isVertigo}
          />
        ) : null}

        {isVertigo ? (
          <VertigoRelatedProducts
            title={t.youMayLike}
            startingAtLabel={t.startingAt}
            products={related}
            restaurantSlug={data.restaurant.slug}
            showPrices={showPrices}
            returnHref={currentProductHref}
            useSubdomainRoutes={useSubdomainRoutes}
          />
        ) : (
          <ProductRail
            title={t.youMayLike}
            products={related}
            restaurantSlug={data.restaurant.slug}
            t={t}
            fillPlaceholders={false}
            showPrices={showPrices}
            showViewAll={false}
            onAddToCart={whatsappOrderingEnabled ? addToCart : undefined}
            networkConfigureEnabled={whatsappOrderingEnabled && showPrices && networkWhatsappCheckoutEnabled}
            returnHref={currentProductHref}
            useSubdomainRoutes={useSubdomainRoutes}
          />
        )}
      </section>
      {whatsappOrderingEnabled && !isVertigo && hasLegacyOrderPrice(product) ? (
        <div className="product-bottom-cart">
          <QuantityControl
            quantity={quantity}
            onDecrease={() => setProductQuantity(product, quantity - 1)}
            onIncrease={() => addToCart(product)}
            label={product.name}
          />
          <Link href={restaurantPath(data.restaurant.slug, "/cart", useSubdomainRoutes)} className="product-cart-link">
            <ShoppingBag size={20} />
            <span>{t.viewCart}</span>
            <b>{cartCount}</b>
          </Link>
        </div>
      ) : null}
    </main>
  );
}

function VertigoRelatedProducts({
  title,
  startingAtLabel,
  products,
  restaurantSlug,
  showPrices,
  returnHref,
  useSubdomainRoutes
}: {
  title: string;
  startingAtLabel: string;
  products: PublicProduct[];
  restaurantSlug: string;
  showPrices: boolean;
  returnHref?: string;
  useSubdomainRoutes: boolean;
}) {
  if (!products.length) {
    return null;
  }

  return (
    <section className="vertigo-related-products">
      <h2>{title}</h2>
      <div className="vertigo-related-list">
        {products.map((product) => (
          <Link
            key={`${product.id}-${product.slug}`}
            className="vertigo-related-card"
            href={productHref(restaurantSlug, product, returnHref, useSubdomainRoutes)}
            scroll
            onClick={() => window.scrollTo(0, 0)}
          >
            <div className="vertigo-related-image">
              <ProductImageMedia product={product} />
            </div>
            <div className="vertigo-related-copy">
              <b className="vertigo-related-name" dir="auto">{product.name}</b>
              {product.description ? (
                <p className="vertigo-related-description" dir="auto">{product.description}</p>
              ) : null}
              {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} className="vertigo-related-price" priceFirst startingAt={product.productConfiguration?.priceDisplay === "STARTING_AT"} startingAtLabel={startingAtLabel} /> : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ProductRail({
  title,
  products,
  restaurantSlug,
  t,
  badgeLabel,
  fillPlaceholders = true,
  showPrices,
  onAddToCart,
  networkConfigureEnabled = false,
  showViewAll = true,
  viewAllHref,
  returnHref,
  useSubdomainRoutes
}: {
  title: string;
  products: PublicProduct[];
  restaurantSlug: string;
  t: PublicTranslations;
  badgeLabel?: string;
  fillPlaceholders?: boolean;
  showPrices: boolean;
  onAddToCart?: (product: PublicProduct) => void;
  networkConfigureEnabled?: boolean;
  showViewAll?: boolean;
  viewAllHref?: string;
  returnHref?: string;
  useSubdomainRoutes: boolean;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const railPointerId = useRef<number | null>(null);
  const railPointerX = useRef(0);
  const railStartScrollLeft = useRef(0);
  const railDragMoved = useRef(false);
  const railRtlScrollType = useRef<"negative" | "reverse" | null>(null);
  const railDragThreshold = 8;
  const railProductSignature = products.map((product) => product.slug).join("|");
  const railSlots = fillPlaceholders ? Array.from({ length: Math.max(3, products.length) }) : products;
  const maxRailScroll = (rail: HTMLDivElement) => Math.max(0, rail.scrollWidth - rail.clientWidth);
  const getRailRtlScrollType = (rail: HTMLDivElement) => {
    if (railRtlScrollType.current) return railRtlScrollType.current;

    const previous = rail.scrollLeft;
    rail.scrollLeft = 1;
    railRtlScrollType.current = rail.scrollLeft === 0 ? "negative" : "reverse";
    rail.scrollLeft = previous;
    return railRtlScrollType.current;
  };
  const getRailScrollPosition = (rail: HTMLDivElement) => {
    const max = maxRailScroll(rail);
    if (window.getComputedStyle(rail).direction !== "rtl") {
      return rail.scrollLeft;
    }

    return getRailRtlScrollType(rail) === "negative" ? -rail.scrollLeft : max - rail.scrollLeft;
  };
  const setRailScrollPosition = (rail: HTMLDivElement, value: number) => {
    const max = maxRailScroll(rail);
    const next = Math.max(0, Math.min(max, value));

    if (window.getComputedStyle(rail).direction !== "rtl") {
      rail.scrollLeft = next;
      return;
    }

    rail.scrollLeft = getRailRtlScrollType(rail) === "negative" ? -next : max - next;
  };

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const frame = window.requestAnimationFrame(() => {
      setRailScrollPosition(rail, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [railProductSignature]);

  if (!products.length && !fillPlaceholders) {
    return null;
  }

  const handleRailPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest("a, button")) return;
    if (maxRailScroll(event.currentTarget) <= 1) return;

    railPointerId.current = event.pointerId;
    railPointerX.current = event.clientX;
    railStartScrollLeft.current = getRailScrollPosition(event.currentTarget);
    railDragMoved.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleRailPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail || railPointerId.current !== event.pointerId) return;

    const deltaX = event.clientX - railPointerX.current;
    if (Math.abs(deltaX) > railDragThreshold) {
      railDragMoved.current = true;
    }

    if (deltaX) {
      setRailScrollPosition(rail, railStartScrollLeft.current - deltaX);
    }
  };

  const handleRailPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (railPointerId.current !== event.pointerId) return;

    railPointerId.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (railDragMoved.current) {
      window.setTimeout(() => {
        railDragMoved.current = false;
      }, 80);
    }
  };

  return (
    <section className="product-rail">
      <div className="rail-head">
        <h2>
          <Flame size={18} />
          {title}
        </h2>
        {showViewAll ? <Link href={viewAllHref ?? restaurantPath(restaurantSlug, "/menu", useSubdomainRoutes)}>{t.viewAll}</Link> : null}
      </div>
      <div
        className="rail-scroll"
        ref={railRef}
        onPointerCancel={handleRailPointerEnd}
        onPointerDown={handleRailPointerDown}
        onPointerMove={handleRailPointerMove}
        onPointerUp={handleRailPointerEnd}
        onDragStart={(event) => event.preventDefault()}
      >
        <span className="rail-scroll-gutter" aria-hidden="true" />
        {railSlots.map((_, index) => {
          const product = products[index];
          return product ? (
          <article key={`${product.id}-${product.slug}`} className={`rail-product ${onAddToCart || networkConfigureEnabled ? "rail-product-cartable" : ""}`}>
            {badgeLabel ? <span className="rail-product-badge">{badgeLabel}</span> : null}
            <Link
              href={productHref(restaurantSlug, product, returnHref, useSubdomainRoutes)}
              scroll
              onClick={(event) => {
                if (railDragMoved.current) {
                  railDragMoved.current = false;
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }

                window.scrollTo(0, 0);
              }}
            >
              <ProductImageMedia product={product} />
        {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} className="rail-price" priceFirst startingAt={product.productConfiguration?.priceDisplay === "STARTING_AT"} startingAtLabel={t.startingAt} /> : null}
        <b>{product.name}</b>
            </Link>
            {onAddToCart && hasLegacyOrderPrice(product) ? (
              <button type="button" onClick={() => onAddToCart(product)} aria-label={`${t.addToCart} ${product.name}`}>
                <ShoppingCart size={14} />
              </button>
            ) : networkConfigureEnabled && isNetworkProduct(product) && product.productConfiguration?.orderable ? (
              <Link className="rail-network-configure" href={productHref(restaurantSlug, product, returnHref, useSubdomainRoutes)}
                aria-label={`${t.addToCart} ${product.name}`} title={t.addToCart}><ShoppingCart size={14} /></Link>
            ) : null}
          </article>
          ) : (
            <article key={`rail-placeholder-${index}`} className="rail-product rail-product-placeholder" aria-hidden="true" />
          );
        })}
        <span className="rail-scroll-gutter" aria-hidden="true" />
      </div>
    </section>
  );
}

function DrawerSocialLinks({
  links,
  onNavigate
}: {
  links: Array<{ key: string; label: string; href: string }>;
  onNavigate: () => void;
}) {
  if (!links.length) {
    return null;
  }

  return (
    <nav className="drawer-social-links" aria-label="Social links">
      {links.map((link) => (
        <a
          key={link.key}
          className={`social-link social-${link.key}`}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={link.label}
          title={link.label}
          onClick={onNavigate}
        >
          <SocialIcon type={link.key} size={20} />
        </a>
      ))}
    </nav>
  );
}

function BottomNav({
  slug,
  active,
  t,
  showHome,
  showMenu,
  useSubdomainRoutes
}: {
  slug: string;
  active: "home" | "menu" | "product" | "cart";
  t: PublicTranslations;
  showHome: boolean;
  showMenu: boolean;
  useSubdomainRoutes: boolean;
}) {
  const itemCount = [showHome, showMenu].filter(Boolean).length;

  if (itemCount <= 1) {
    return null;
  }

  return (
    <nav className="public-bottom-nav" style={{ "--bottom-nav-count": itemCount } as React.CSSProperties}>
      {showHome ? <Link href={restaurantPath(slug, "/", useSubdomainRoutes)} className={active === "home" ? "active" : ""}>
        <Home size={20} />
        {t.home}
      </Link> : null}
      {showMenu ? <Link href={restaurantPath(slug, "/menu", useSubdomainRoutes)} className={active === "menu" || active === "product" ? "active" : ""}>
        <Utensils size={20} />
        {t.menu}
      </Link> : null}
    </nav>
  );
}
