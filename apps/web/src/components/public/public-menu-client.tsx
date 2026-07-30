"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createElement, type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Beef, ChevronLeft, ChevronRight, Clock3, Drumstick, Flame, Home, Image as ImageIcon, LayoutGrid, List, Loader2, Menu, Minus, Plus, Rotate3D, Scale, Settings2, ShoppingBag, ShoppingCart, Star, Trash2, Truck, Utensils, Wheat, X } from "lucide-react";
import { PublicCategory, PublicMenuData, PublicProduct, cssVars } from "@/lib/api";

type CartItem = {
  slug: string;
  name: string;
  quantity: number;
  price: number;
  currency: string;
  imageUrl?: string | null;
  description?: string | null;
};

type PublicLanguage = "ar" | "en";
type CategoryProductListLayout = "single" | "double";
type MenuDisplayMode = "large" | "list";
type ProductMediaMode = "image" | "3d";
type NormalizedIngredient = { name: string; imageUrl?: string | null };

const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

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

function moodMenuHref(restaurantSlug: string, label: string) {
  return `/m/${restaurantSlug}/menu?mood=${encodeURIComponent(label)}`;
}

function collectionMenuHref(restaurantSlug: string, collection: "popular" | "new") {
  return `/m/${restaurantSlug}/menu?collection=${collection}`;
}

function safeInternalHref(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function productHref(restaurantSlug: string, product: PublicProduct, returnHref?: string | null) {
  const href = `/m/${restaurantSlug}/product/${encodeURIComponent(product.id || product.slug)}`;
  const safeReturnHref = safeInternalHref(returnHref);
  return safeReturnHref ? `${href}?from=${encodeURIComponent(safeReturnHref)}` : href;
}

function navigateBack(fallbackHref: string) {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.assign(fallbackHref);
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

function productImage(product: PublicProduct) {
  return product.imageUrl ?? product.images?.[0]?.url ?? "/assets/public/menu-products.png";
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

  const values = Array.from(uniqueImages.values());
  return values.length ? values : [{ url: "/assets/public/menu-products.png", altText: product.name }];
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
        : { name: ingredient.name?.trim() ?? "", imageUrl: ingredient.imageUrl ?? null }
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
  productSlug
}: {
  data: PublicMenuData;
  view: "home" | "menu" | "product" | "cart";
  productSlug?: string;
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [language, setLanguage] = useState<PublicLanguage>("ar");
  const [drawerTab, setDrawerTab] = useState<"info" | "hours">("info");
  const [splashVisible, setSplashVisible] = useState(false);
  const [menuNested, setMenuNested] = useState(false);
  const [menuBackSignal, setMenuBackSignal] = useState(0);
  const storageKey = `cart:${data.restaurant.slug}:main`;
  const languageStorageKey = `language:${data.restaurant.slug}`;
  const splashStorageKey = `splash:${data.restaurant.slug}`;
  const products = data.products;
  const activeProduct = productSlug
    ? products.find((product) => isProductRouteMatch(product, productSlug))
    : products[0];
  const t = translations[language];
  const showPrices = data.restaurant.showPrices ?? true;
  const currency = data.restaurant.currency ?? cart[0]?.currency ?? "ل.س";
  const firstBranch = data.restaurant.branches?.[0];
  const openingHours = formatOpeningHours(firstBranch?.openingHours, language);
  const allBuilderSections = data.menus?.flatMap((menu) => menu.pages?.flatMap((page) => page.sections ?? []) ?? []) ?? [];
  const hasHomeSections = !data.menus?.length || allBuilderSections.some((section) =>
    ["HERO", "MOOD_STRIP", "FEATURED_PRODUCTS"].includes(section.type) && section.isActive !== false
  );
  const activeView = view === "home" && !hasHomeSections ? "menu" : view;
  const showMenuNavItem = Boolean(data.products.length || data.categories.length);
  const showBottomNav = [hasHomeSections, showMenuNavItem].filter(Boolean).length > 1;
  const isSingleMenuPage = activeView === "menu" && showMenuNavItem && !hasHomeSections;
  const splashSettings = data.restaurant.splashScreen;
  const splashLogoUrl = splashSettings?.logoUrl ?? data.restaurant.logoUrl;
  const splashBackgroundImageUrl = splashSettings?.backgroundType === "IMAGE" ? splashSettings.backgroundImageUrl : null;
  const splashBackgroundColor = splashSettings?.backgroundColor ?? data.theme?.colors?.primary ?? "#e51f2a";
  const splashLogoX = splashSettings?.logoX ?? 50;
  const splashLogoY = splashSettings?.logoY ?? 50;

  useEffect(() => {
    setCartLoaded(false);
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as CartItem[];
        setCart(parsed.map((item) => ({
          ...item,
          name: item.name || item.slug,
          quantity: Math.max(1, Number(item.quantity) || 1),
          price: Number(item.price) || 0,
          currency: item.currency || data.restaurant.currency || "ل.س",
          imageUrl: item.imageUrl ?? null,
          description: item.description ?? null
        })));
      } catch {
        setCart([]);
      }
    } else {
      setCart([]);
    }
    setCartLoaded(true);
  }, [data.restaurant.currency, storageKey]);

  useEffect(() => {
    const stored = window.localStorage.getItem(languageStorageKey);
    if (stored === "ar" || stored === "en") {
      setLanguage(stored);
    }
  }, [languageStorageKey]);

  useEffect(() => {
    if (!cartLoaded) {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(cart));
  }, [cart, cartLoaded, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
  }, [language, languageStorageKey]);

  useEffect(() => {
    if (window.sessionStorage.getItem(splashStorageKey)) {
      return;
    }

    window.sessionStorage.setItem(splashStorageKey, "1");
    setSplashVisible(true);
    const timer = window.setTimeout(() => setSplashVisible(false), 3000);

    return () => window.clearTimeout(timer);
  }, [splashStorageKey]);

  useEffect(() => {
    if (activeView !== "menu") {
      setMenuNested(false);
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "product") {
      return;
    }

    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, productSlug]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addToCart(product: PublicProduct) {
    setCart((current) => {
      const existing = current.find((item) => item.slug === product.slug);
      if (existing) {
        return current.map((item) =>
          item.slug === product.slug ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [
        ...current,
        {
          slug: product.slug,
          name: product.name,
          quantity: 1,
          price: productPrice(product),
          currency: product.currency,
          imageUrl: productImage(product),
          description: product.description
        }
      ];
    });
  }

  function setProductQuantity(product: PublicProduct, quantity: number) {
    setCart((current) => {
      const nextQuantity = Math.max(0, quantity);
      const existing = current.find((item) => item.slug === product.slug);

      if (nextQuantity <= 0) {
        return current.filter((item) => item.slug !== product.slug);
      }

      if (existing) {
        return current.map((item) =>
          item.slug === product.slug
            ? {
              ...item,
              quantity: nextQuantity,
              price: productPrice(product),
              currency: product.currency,
              imageUrl: productImage(product),
              description: product.description
            }
            : item
        );
      }

      return [
        ...current,
        {
          slug: product.slug,
          name: product.name,
          quantity: nextQuantity,
          price: productPrice(product),
          currency: product.currency,
          imageUrl: productImage(product),
          description: product.description
        }
      ];
    });
  }

  function updateCartItem(slug: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) => (item.slug === slug ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function removeCartItem(slug: string) {
    setCart((current) => current.filter((item) => item.slug !== slug));
  }

  function getCartQuantity(slug: string) {
    return cart.find((item) => item.slug === slug)?.quantity ?? 0;
  }

  function requestMenuBack() {
    setMenuNested(false);
    setMenuBackSignal((current) => current + 1);
  }

  const whatsappMessage = useMemo(() => {
    if (!showPrices) {
      return [
        `${t.newOrderFrom} ${data.restaurant.name}`,
        "",
        t.items,
        ...cart.map((item, index) => `${index + 1}. ${item.quantity}x ${item.name}`),
        `${t.time}: ${new Date().toLocaleString(language === "ar" ? "ar-SY" : "en-US")}`
      ].join("\n");
    }

    const lines = [
      `${t.newOrderFrom} ${data.restaurant.name}`,
      "",
      t.items,
      ...cart.map((item, index) => showPrices ? `${index + 1}. ${item.quantity}x ${item.name} - ${item.price * item.quantity} ${item.currency}` : `${index + 1}. ${item.quantity}x ${item.name}`),
      "",
      `${t.total}: ${cartTotal} ${currency}`,
      `${t.time}: ${new Date().toLocaleString(language === "ar" ? "ar-SY" : "en-US")}`
    ];
    return lines.join("\n");
  }, [cart, cartTotal, currency, data.restaurant.name, language, showPrices, t]);

  const whatsappUrl = `https://wa.me/${data.restaurant.whatsappPhone ?? ""}?text=${encodeURIComponent(whatsappMessage)}`;

  async function sendWhatsappOrder() {
    if (!cart.length || orderSubmitting) {
      return;
    }

    setOrderSubmitting(true);
    setOrderMessage(null);

    try {
      const response = await fetch(`${PUBLIC_API_BASE_URL}/public/menus/${data.restaurant.slug}/orders/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productSlug: item.slug,
            quantity: item.quantity
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
      window.open(whatsappUrl, "_blank", "noreferrer");
    } finally {
      setOrderSubmitting(false);
    }
  }

  return (
    <div
      className={`public-screen view-${activeView} ${showPrices ? "" : "prices-hidden"} ${showBottomNav ? "" : "no-bottom-nav"} ${activeView === "menu" && menuNested ? "menu-nested" : ""}`}
      dir={language === "ar" ? "rtl" : "ltr"}
      onContextMenu={(event) => event.preventDefault()}
      style={cssVars(data.theme)}
    >
      {splashVisible ? (
        <div
          className="public-splash"
          role="button"
          tabIndex={0}
          aria-label={data.restaurant.name}
          onClick={() => setSplashVisible(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
              setSplashVisible(false);
            }
          }}
          onPointerDown={() => setSplashVisible(false)}
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
      <header className="public-header">
        {activeView === "cart" ? (
          <button onClick={() => navigateBack(`/m/${data.restaurant.slug}`)} aria-label="الرجوع">
            <ChevronLeft size={22} />
          </button>
        ) : activeView === "menu" && menuNested ? (
          <button onClick={requestMenuBack} aria-label="الرجوع">
            <ArrowLeft size={22} />
          </button>
        ) : isSingleMenuPage ? (
          <button className="public-header-menu-button" onClick={() => setDrawerOpen(true)} aria-label={t.menu}>
            <Menu size={24} />
          </button>
        ) : activeView === "menu" ? (
          <button onClick={() => navigateBack(`/m/${data.restaurant.slug}`)} aria-label="الرجوع">
            <ArrowLeft size={22} />
          </button>
        ) : (
          <button onClick={() => setDrawerOpen(true)} aria-label={t.menu}>
            <Menu size={24} />
          </button>
        )}
        <p className={isSingleMenuPage ? "public-header-title single-menu-title" : "public-header-title"}>
          {activeView === "cart" ? (
            "تأكيد الطلب"
          ) : isSingleMenuPage ? (
            <span className="restaurant-name">{data.restaurant.name.trim() || t.menu}</span>
          ) : (
            t.chooseCategory
          )}
        </p>
        {data.restaurant.logoUrl ? <img src={data.restaurant.logoUrl} alt={data.restaurant.name} /> : <span className="public-logo-fallback" />}
      </header>

      {activeView === "home" ? (
        <HomeView data={data} addToCart={addToCart} t={t} showPrices={showPrices} />
      ) : activeView === "menu" ? (
        <MenuView
          data={data}
          addToCart={addToCart}
          setProductQuantity={setProductQuantity}
          getCartQuantity={getCartQuantity}
          t={t}
          showPrices={showPrices}
          menuBackSignal={menuBackSignal}
          onNestedChange={setMenuNested}
        />
      ) : activeView === "product" && activeProduct ? (
        <ProductView
          data={data}
          product={activeProduct}
          addToCart={addToCart}
          setProductQuantity={setProductQuantity}
          getCartQuantity={getCartQuantity}
          cartCount={cartCount}
          t={t}
          showPrices={showPrices}
        />
      ) : activeView === "product" ? (
        <main className="product-detail product-empty">
          <ShoppingBag size={34} />
          <b>{language === "ar" ? "المنتج غير متوفر حالياً" : "Product is currently unavailable"}</b>
          <Link href={`/m/${data.restaurant.slug}/menu`}>{t.menu}</Link>
        </main>
      ) : (
        <CartView
          data={data}
          cart={cart}
          updateCartItem={updateCartItem}
          removeCartItem={removeCartItem}
          addToCart={addToCart}
          sendWhatsappOrder={sendWhatsappOrder}
          orderSubmitting={orderSubmitting}
          orderMessage={orderMessage}
          t={t}
          showPrices={showPrices}
        />
      )}

      {cartCount > 0 && activeView !== "cart" && activeView !== "product" ? (
        <Link href={`/m/${data.restaurant.slug}/cart`} className={`sticky-cart-button ${showPrices ? "" : "prices-hidden"}`}>
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
      />

      {drawerOpen ? (
        <aside className="public-drawer">
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t.close}>
            <X size={24} />
          </button>
          {data.restaurant.logoUrl ? (
            <img className="public-drawer-logo" src={data.restaurant.logoUrl} alt={data.restaurant.name} />
          ) : (
            <span className="public-drawer-logo" />
          )}
          <button type="button" onClick={() => setLanguage((current) => (current === "ar" ? "en" : "ar"))}>
            <span>{t.language}</span>
            <b>{t.switchLanguage}</b>
          </button>
          <button type="button" className={drawerTab === "info" ? "active" : ""} onClick={() => setDrawerTab("info")}>
            <span>{t.settings}</span>
            <Settings2 size={18} />
          </button>
          <button type="button" className={drawerTab === "hours" ? "active" : ""} onClick={() => setDrawerTab("hours")}>
            <span>{t.hours}</span>
            <Clock3 size={18} />
          </button>
          {[t.complaints, t.social, t.questions, t.rating].map((item) => (
            <button key={item}>
              <span>{item}</span>
              <ArrowLeft size={18} />
            </button>
          ))}
          <div className="drawer-restaurant-info">
            {drawerTab === "info" ? (
              <>
                {data.restaurant.description ? <p>{data.restaurant.description}</p> : null}
                {firstBranch?.address ? <span>{firstBranch.address}</span> : null}
                {data.restaurant.phone ? <span>{data.restaurant.phone}</span> : null}
                {data.restaurant.email ? <span>{data.restaurant.email}</span> : null}
                <b>{currency}</b>
              </>
            ) : (
              <div className="drawer-hours-list">
                {openingHours?.length ? openingHours.map((row) => <small key={row}>{row}</small>) : <small>لا توجد أوقات دوام محددة</small>}
              </div>
            )}
          </div>
          <small>Version 0.1.0+12</small>
        </aside>
      ) : null}
    </div>
  );
}

function HomeView({
  data,
  addToCart,
  t,
  showPrices
}: {
  data: PublicMenuData;
  addToCart: (product: PublicProduct) => void;
  t: PublicTranslations;
  showPrices: boolean;
}) {
  const featured = data.products.filter(isFeatured);
  const popular = data.products.filter(isPopular);
  const featuredSlots = featured.slice(0, 2);
  const allPages = data.menus?.flatMap((menu) => menu.pages ?? []) ?? [];
  const homePage = allPages.find((page) => page.isHome && page.sections?.some((section) => section.type === "HERO" && section.isActive !== false))
    ?? allPages.find((page) => page.isHome)
    ?? allPages[0];
  const heroSection = homePage?.sections?.find((section) => section.type === "HERO" && section.isActive !== false);
  const moodSection = homePage?.sections?.find((section) => section.type === "MOOD_STRIP" && section.isActive !== false);
  const moodItems: MoodItem[] = moodSection?.settings?.moodItems?.length
    ? moodSection.settings.moodItems
      .filter((item) => item.label?.trim())
      .map((item) => {
        const label = item.label.trim();
        return {
          label,
          href: moodMenuHref(data.restaurant.slug, label),
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
  const moodSlots = moodItems;
  const adBanners = heroSection?.settings?.adBanners?.filter((banner) => banner.imageUrl && banner.isActive !== false) ?? [];
  const bannerSlides = adBanners;
  const homeReturnHref = `/m/${data.restaurant.slug}`;
  const [activeBanner, setActiveBanner] = useState(0);
  const bannerTouchStartX = useRef<number | null>(null);

  useEffect(() => {
    setActiveBanner(0);
  }, [bannerSlides.length]);

  useEffect(() => {
    if (bannerSlides.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveBanner((current) => (current + 1) % bannerSlides.length);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [bannerSlides.length]);

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
    const deltaX = startX - endX;

    if (Math.abs(deltaX) < 40) {
      return;
    }

    moveBanner(deltaX > 0 ? 1 : -1);
  }

  return (
    <main className="public-content">
      <section className="mood-strip">
        <h1>
          <Flame size={18} />
          {t.moodToday}
        </h1>
          <div>
            {moodSlots.map((_, index) => {
              const item = moodItems[index];
              return item ? (
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
              ) : (
                <span key={`mood-placeholder-${index}`} className="mood-chip mood-chip-placeholder" aria-hidden="true" />
              );
            })}
          </div>
      </section>

      <section
        className={bannerSlides.length ? "hero-promo hero-promo-carousel" : "hero-promo hero-promo-empty"}
        onTouchStart={handleBannerTouchStart}
        onTouchEnd={handleBannerTouchEnd}
      >
        {bannerSlides.length ? (
          <>
            <div className="hero-promo-track">
              {bannerSlides.map((banner, index) => (
                <div
                  key={`${banner.imageUrl}-${index}`}
                  className={index === activeBanner ? "hero-promo-slide active" : "hero-promo-slide"}
                  aria-hidden={index === activeBanner ? undefined : true}
                >
                  <img src={banner.imageUrl} alt={banner.title || t.todayOffer} />
                  {banner.badge ? <span>{banner.badge}</span> : null}
                </div>
              ))}
            </div>
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
          </>
        ) : null}
      </section>

      <ProductRail
        title={t.mostPopular}
        products={popular}
        restaurantSlug={data.restaurant.slug}
        t={t}
        fillPlaceholders={false}
        showPrices={showPrices}
        onAddToCart={addToCart}
        showViewAll={false}
        returnHref={homeReturnHref}
      />

      <section className="new-grid">
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
            <Link key={`${product.id}-${product.slug}`} href={productHref(data.restaurant.slug, product, homeReturnHref)} className="wide-product">
              <img src={productImage(product)} alt={product.name} />
              <b>{product.name}</b>
              <span>{t.newTaste}</span>
              <em>{t.mealDetails}</em>
            </Link>
            ) : (
              <span key={`featured-placeholder-${index}`} className="wide-product wide-product-placeholder" aria-hidden="true" />
            );
          })}
        </div>
      </section>
    </main>
  );
}

function MenuView({
  data,
  addToCart,
  setProductQuantity,
  getCartQuantity,
  t,
  showPrices,
  menuBackSignal,
  onNestedChange
}: {
  data: PublicMenuData;
  addToCart: (product: PublicProduct) => void;
  setProductQuantity: (product: PublicProduct, quantity: number) => void;
  getCartQuantity: (slug: string) => number;
  t: PublicTranslations;
  showPrices: boolean;
  menuBackSignal: number;
  onNestedChange: (nested: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const menuQuery = searchParams.toString();
  const selectedMood = searchParams.get("mood")?.trim() || "";
  const selectedCollection = searchParams.get("collection") === "popular" || searchParams.get("collection") === "new"
    ? searchParams.get("collection")
    : "";
  const selectedCategoryParam = searchParams.get("category")?.trim() || "";
  const allPages = data.menus?.flatMap((menu) => menu.pages ?? []) ?? [];
  const categoryGridSection = allPages
    .flatMap((page) => page.sections ?? [])
    .find((section) => section.type === "CATEGORY_GRID");
  const categoryControlsEnabled = categoryGridSection ? categoryGridSection.isActive !== false : true;
  const showCategoryLanding = categoryControlsEnabled && categoryGridSection?.settings?.showLandingCategories !== false;
  const showNestedCategoryStrip = categoryControlsEnabled && categoryGridSection?.settings?.showNestedCategoryStrip !== false;
  const [selectedCategorySlug, setSelectedCategorySlug] = useState(
    selectedCategoryParam || (selectedMood || selectedCollection || !showCategoryLanding ? "all" : "")
  );
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [activeSpotlightIndex, setActiveSpotlightIndex] = useState(0);
  const spotlightTouchStartX = useRef<number | null>(null);
  const scrollSpyUpdate = useRef(false);
  const manualCategoryScrollUntil = useRef(0);
  const contextEntryScrollPending = useRef(Boolean(selectedMood || selectedCollection));
  const [menuDisplayMode, setMenuDisplayMode] = useState<MenuDisplayMode>("list");
  const lastMenuBackSignal = useRef(menuBackSignal);
  const allCategory = data.categories.find((category) => category.slug === "all");
  const regularCategories = data.categories.filter((category) => category.slug !== "all");
  const selectedMoodKey = normalizeMenuKey(selectedMood);
  const moodProducts = selectedMood
    ? data.products.filter((product) => {
      const productCategorySlug = product.category?.slug ?? product.categorySlug ?? "";
      const category = regularCategories.find((item) => item.slug === productCategorySlug);
      return [
        product.moodKey,
        productCategorySlug,
        product.category?.name,
        category?.slug,
        category?.name
      ].some((value) => normalizeMenuKey(value) === selectedMoodKey);
    })
    : [];
  const collectionProducts = selectedCollection === "popular"
    ? data.products.filter(isPopular)
    : selectedCollection === "new"
      ? data.products.filter(isFeatured).length ? data.products.filter(isFeatured) : data.products.filter(isNew)
      : [];
  const contextTitle = selectedMood || (selectedCollection === "popular" ? t.mostPopular : selectedCollection === "new" ? t.newItems : "");
  const contextProducts = selectedMood ? moodProducts : collectionProducts;
  const visibleProducts = data.products;
  const categoryProductsSource = data.products;
  const productListLayout: CategoryProductListLayout = data.theme?.layout?.categoryProductListLayout === "single" ? "single" : "double";
  const menuReturnParams = new URLSearchParams(menuQuery);

  if (selectedCategorySlug && !selectedMood && !selectedCollection) {
    menuReturnParams.set("category", selectedCategorySlug);
  } else {
    menuReturnParams.delete("category");
  }

  const menuReturnQuery = menuReturnParams.toString();
  const menuReturnHref = `/m/${data.restaurant.slug}/menu${menuReturnQuery ? `?${menuReturnQuery}` : ""}`;
  const activeCategory = selectedCategorySlug === "all"
    ? allCategory
    : regularCategories.find((category) => category.slug === selectedCategorySlug);
  const activeProducts = selectedCategorySlug === "all"
    ? visibleProducts
    : categoryProductsSource.filter((product) => (product.category?.slug ?? product.categorySlug) === selectedCategorySlug);
  const spotlightProduct = activeProducts[activeProducts.length ? activeSpotlightIndex % activeProducts.length : 0];
  const productsWithoutCategory = selectedCategorySlug === "all"
    ? visibleProducts.filter((product) => !regularCategories.some((category) => (product.category?.slug ?? product.categorySlug) === category.slug))
    : [];

  useEffect(() => {
    if (selectedMood || selectedCollection) {
      contextEntryScrollPending.current = true;
      setSelectedCategorySlug("all");
    }
  }, [selectedCollection, selectedMood]);

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
      window.location.href = `/m/${data.restaurant.slug}`;
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
    if (!selectedCategorySlug) {
      return;
    }

    if (contextEntryScrollPending.current) {
      contextEntryScrollPending.current = false;
      const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
      return () => window.cancelAnimationFrame(frame);
    }

    if (scrollSpyUpdate.current) {
      scrollSpyUpdate.current = false;
      return;
    }

    const frame = scrollToCategory(selectedCategorySlug);
    return () => window.cancelAnimationFrame(frame);
  }, [menuDisplayMode, selectedCategorySlug, selectedCollection, selectedMood]);

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

      const threshold = 132;
      let nextSlug = "all";

      for (const section of categorySections) {
        const element = document.getElementById(section.id);
        if (!element) continue;

        if (element.getBoundingClientRect().top <= threshold) {
          nextSlug = section.slug;
        }
      }

      setSelectedCategorySlug((current) => {
        if (current === nextSlug) {
          return current;
        }

        scrollSpyUpdate.current = true;
        return nextSlug;
      });
    }

    syncActiveCategoryToScroll();
    window.addEventListener("scroll", syncActiveCategoryToScroll, { passive: true });
    window.addEventListener("resize", syncActiveCategoryToScroll);

    return () => {
      window.removeEventListener("scroll", syncActiveCategoryToScroll);
      window.removeEventListener("resize", syncActiveCategoryToScroll);
    };
  }, [categoryProductsSource, menuDisplayMode, regularCategories, selectedCategorySlug, showNestedCategoryStrip]);

  function scrollToCategory(slug: string) {
    const targetId = menuDisplayMode === "large" || slug === "all" ? "menu-products-start" : `category-section-${slug}`;
    return window.requestAnimationFrame(() => {
      const element = document.getElementById(targetId);
      if (!element) {
        return;
      }

      const top = element.getBoundingClientRect().top + window.scrollY - (showNestedCategoryStrip ? 92 : 16);
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function selectCategory(slug: string) {
    manualCategoryScrollUntil.current = Date.now() + 900;
    scrollSpyUpdate.current = false;
    setSelectedCategorySlug(slug);
    scrollToCategory(slug);
  }

  function moveSpotlight(direction: -1 | 1) {
    if (activeProducts.length <= 1) return;
    setActiveSpotlightIndex((current) => (current + direction + activeProducts.length) % activeProducts.length);
  }

  function openProduct(product: PublicProduct) {
    if (productListLayout === "double") {
      setSelectedProduct(product);
      return;
    }

    window.location.assign(productHref(data.restaurant.slug, product, menuReturnHref));
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
    moveSpotlight(deltaX > 0 ? -1 : 1);
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
    const productClassName = productListLayout === "double" ? "menu-product-card" : "menu-product-row";
    const quantity = getCartQuantity(product.slug);
    const productContent = (
      <>
        <span className="menu-product-image-link">
          <img src={productImage(product)} alt={product.name} />
        </span>
        <div className="menu-product-copy">
          <b>{product.name}</b>
          <p>{product.description}</p>
          {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} /> : null}
        </div>
      </>
    );

    return (
      <article key={`${product.id}-${product.slug}`} className={productClassName}>
        <button type="button" className="menu-product-open" onClick={() => openProduct(product)}>
          {productContent}
        </button>
        {productListLayout === "single" ? (
          <QuantityControl
            className="menu-product-quantity"
            quantity={quantity}
            onDecrease={() => setProductQuantity(product, quantity - 1)}
            onIncrease={() => addToCart(product)}
            label={product.name}
          />
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
                onAddToCart={productListLayout === "double" ? undefined : addToCart}
                returnHref={menuReturnHref}
              />
            </section>
          ) : null}

          {showNestedCategoryStrip ? <section className="menu-category-strip" id="menu-categories">
            {data.categories.map((category) => {
              const isAllCategory = category.slug === "all";
              const isActive = category.slug === selectedCategorySlug;
              const productsCount = isAllCategory
                ? visibleProducts.length
                : categoryProductsSource.filter((product) => (product.category?.slug ?? product.categorySlug) === category.slug).length;

              return (
                <button
                  type="button"
                  key={category.slug}
                  className={`menu-category-chip ${isActive ? "active" : ""} ${category.visualScrollEnabled ? "visual-scroll" : ""}`}
                  onClick={() => selectCategory(category.slug)}
                >
                  <span className="menu-category-icon" style={categoryChipStyle(category)}>
                    {category.imageUrl ? <img src={category.imageUrl} alt="" aria-hidden="true" /> : <LayoutGrid size={24} />}
                  </span>
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
              onClick={() => setMenuDisplayMode("large")}
              aria-label="عرض المنتج الكبير"
              title="عرض المنتج الكبير"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={menuDisplayMode === "list" ? "active" : ""}
              onClick={() => setMenuDisplayMode("list")}
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
                onTouchStart={handleSpotlightTouchStart}
                onTouchEnd={handleSpotlightTouchEnd}
              >
                <button type="button" className="category-spotlight-open" onClick={() => openProduct(spotlightProduct)}>
                  <img src={productImage(spotlightProduct)} alt={spotlightProduct.name} />
                  <div className="category-spotlight-copy">
                    <b>{spotlightProduct.name}</b>
                    {showPrices ? <ProductPrice price={productPrice(spotlightProduct)} currency={spotlightProduct.currency} className="spotlight-price" /> : null}
                    {spotlightProduct.description ? <p title={spotlightProduct.description}>{spotlightProduct.description}</p> : null}
                  </div>
                </button>
                <div className="category-spotlight-controls">
                  <QuantityControl
                    quantity={getCartQuantity(spotlightProduct.slug)}
                    onDecrease={() => setProductQuantity(spotlightProduct, getCartQuantity(spotlightProduct.slug) - 1)}
                    onIncrease={() => addToCart(spotlightProduct)}
                    label={spotlightProduct.name}
                  />
                </div>
              </article>
              <div className="spotlight-actions">
                <div className="spotlight-pager">
                  <button type="button" className="spotlight-arrow prev" onClick={() => moveSpotlight(-1)} aria-label="المنتج السابق" disabled={activeProducts.length <= 1}>
                    <ChevronRight size={22} />
                  </button>
                  <button type="button" className="spotlight-arrow next" onClick={() => moveSpotlight(1)} aria-label="المنتج التالي" disabled={activeProducts.length <= 1}>
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
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}
    </main>
  );
}

function ProductQuickViewModal({
  product,
  showPrices,
  onClose
}: {
  product: PublicProduct;
  showPrices: boolean;
  onClose: () => void;
}) {
  const gallery = productImages(product);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const activeImage = gallery[activeImageIndex] ?? gallery[0];

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product.slug]);

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
          <img src={activeImage.url} alt={activeImage.altText || product.name} />
          <span>{activeImageIndex + 1}/{gallery.length}</span>
          {gallery.length > 1 ? (
            <>
              <button type="button" className="prev" onClick={() => moveImage(-1)} aria-label="الصورة السابقة">
                <ChevronRight size={18} />
              </button>
              <button type="button" className="next" onClick={() => moveImage(1)} aria-label="الصورة التالية">
                <ChevronLeft size={18} />
              </button>
            </>
          ) : null}
        </div>
        <div className="product-quick-body">
          <h2>{product.name}</h2>
          <p>{product.description}</p>
          {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} /> : null}
        </div>
      </article>
    </div>
  );
}

function ProductPrice({
  price,
  currency,
  className = ""
}: {
  price: number;
  currency: string;
  className?: string;
}) {
  return (
    <strong className={`product-price ${className}`.trim()}>
      <span>{price}</span>
      <small>{currency}</small>
    </strong>
  );
}

function QuantityControl({
  quantity,
  onDecrease,
  onIncrease,
  label,
  className = ""
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`quantity-control ${className}`.trim()}>
      <button type="button" onClick={onIncrease} aria-label={`+ ${label}`}>
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
  removeCartItem,
  addToCart,
  sendWhatsappOrder,
  orderSubmitting,
  orderMessage,
  t,
  showPrices
}: {
  data: PublicMenuData;
  cart: CartItem[];
  updateCartItem: (slug: string, quantity: number) => void;
  removeCartItem: (slug: string) => void;
  addToCart: (product: PublicProduct) => void;
  sendWhatsappOrder: () => void;
  orderSubmitting: boolean;
  orderMessage: string | null;
  t: PublicTranslations;
  showPrices: boolean;
}) {
  const [cartStep, setCartStep] = useState<"review" | "confirm">("review");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const productBySlug = useMemo(() => new Map(data.products.map((product) => [product.slug, product])), [data.products]);
  const cartSlugs = useMemo(() => new Set(cart.map((item) => item.slug)), [cart]);
  const related = data.products.filter((product) => !cartSlugs.has(product.slug)).slice(0, 8);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = fulfillment === "delivery" ? 0 : 0;
  const total = subtotal + deliveryFee;
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const [orderNumber, setOrderNumber] = useState("001");

  useEffect(() => {
    if (!cart.length) {
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
  }, [cart.length, data.restaurant.slug]);

  useEffect(() => {
    function restoreReviewStep() {
      setCartStep("review");
    }

    window.addEventListener("popstate", restoreReviewStep);
    return () => window.removeEventListener("popstate", restoreReviewStep);
  }, []);

  function goToConfirmStep() {
    window.history.pushState({ cartStep: "confirm" }, "", window.location.href);
    setCartStep("confirm");
  }

  function handleCheckoutAction() {
    if (cartStep === "review") {
      goToConfirmStep();
      return;
    }

    if (fulfillment === "delivery") {
      const requiredInputs = Array.from(document.querySelectorAll<HTMLInputElement>(".cart-confirm-form input")).slice(0, 3);
      const firstEmpty = requiredInputs.find((input) => !input.value.trim());
      if (firstEmpty) {
        setCheckoutError("يرجى تعبئة المنطقة وقريب من وجانب قبل إرسال الطلب.");
        firstEmpty.focus();
        return;
      }
    }

    setCheckoutError(null);
    sendWhatsappOrder();
  }

  return (
    <main className={`cart-page ${showPrices ? "" : "prices-hidden"}`}>
      <CheckoutSteps active={cartStep} />

      {cartStep === "review" ? (
        <>
          {cart.length ? (
            <section className="cart-page-list">
              {cart.map((item) => {
                const product = productBySlug.get(item.slug);
                const imageUrl = item.imageUrl ?? (product ? productImage(product) : "/assets/public/menu-products.png");
                const ingredientNames = product
                  ? productIngredients(product).map((ingredient) => ingredient.name).filter(Boolean).join(" - ")
                  : "";

                return (
                  <article key={item.slug} className="cart-page-item">
                    <img src={imageUrl} alt={item.name} />
                    <div className="cart-page-copy">
                      <b>{item.name}</b>
                      {ingredientNames ? <p dir="auto" title={ingredientNames}>{ingredientNames}</p> : null}
                      {showPrices ? <ProductPrice price={item.price * item.quantity} currency={item.currency} /> : null}
                    </div>
                    <div className="cart-page-stepper" aria-label={item.name}>
                      <button type="button" onClick={() => updateCartItem(item.slug, item.quantity + 1)} aria-label={`+ ${item.name}`}>
                        <Plus size={14} />
                      </button>
                      <strong>{item.quantity}</strong>
                      <button type="button" onClick={() => updateCartItem(item.slug, item.quantity - 1)} disabled={item.quantity <= 0} aria-label={`- ${item.name}`}>
                        <Minus size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="cart-page-remove"
                      onClick={() => removeCartItem(item.slug)}
                      aria-label={`${t.removeItem} ${item.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="cart-empty">
              <ShoppingBag size={34} />
              <b>{t.emptyCart}</b>
              <Link href={`/m/${data.restaurant.slug}/menu`}>{t.menu}</Link>
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
            showViewAll={false}
            returnHref={`/m/${data.restaurant.slug}/cart`}
          />
        </>
      ) : (
        <section className={`cart-confirm-form ${fulfillment === "pickup" ? "pickup-mode" : "delivery-mode"}`}>
          <div className="fulfillment-toggle">
            <button type="button" className={fulfillment === "delivery" ? "active" : ""} onClick={() => setFulfillment("delivery")}>
              <Truck size={18} />
              توصيل دليفري
            </button>
            <button type="button" className={fulfillment === "pickup" ? "active" : ""} onClick={() => setFulfillment("pickup")}>
              <ShoppingBag size={18} />
              استلام من المطعم
            </button>
          </div>
          {cartStep === "confirm" && fulfillment === "delivery" ? (
            <>
              <label>
                <span>المنطقة</span>
                <input placeholder="حلب الجديدة" />
              </label>
              <label>
                <span>قريب من</span>
                <input placeholder="مشفى الشهباء" />
              </label>
              <label>
                <span>جانب</span>
                <input placeholder="صيدلية باسل" />
              </label>
              <label>
                <span>ملاحظة للطلب</span>
                <input placeholder="ملاحظة" />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>ملاحظة</span>
                <input placeholder="ملاحظة" />
              </label>
              <label>
                <span>وقت الاستلام</span>
                <input placeholder="اسرع وقت" />
              </label>
            </>
          )}
        </section>
      )}

      <section className="cart-checkout-card">
        <div className="cart-checkout-meta">
          <span>{t.selectedItems} <b>{cartCount}</b></span>
          <span>{t.orderNumber}: {orderNumber}</span>
        </div>
        <dl>
          <div>
            <dt>{t.subtotal}</dt>
            <dd>{subtotal}{data.restaurant.currency ?? "ل.س"}</dd>
          </div>
          {fulfillment === "delivery" ? (
          <div>
              <dt>{t.deliveryFee}</dt>
              <dd>{deliveryFee}{data.restaurant.currency ?? "ل.س"}</dd>
          </div>
          ) : null}
          <div>
            <dt />
            <dd>{total}{data.restaurant.currency ?? "ل.س"}</dd>
          </div>
        </dl>
        {checkoutError ? <p className="cart-message">{checkoutError}</p> : null}
        {orderMessage ? <p className="cart-message">{orderMessage}</p> : null}
        <button
          type="button"
          className="cart-whatsapp"
          onClick={handleCheckoutAction}
          disabled={!cart.length || orderSubmitting}
        >
          {orderSubmitting ? <Loader2 size={18} className="spin" /> : <ShoppingBag size={18} />}
          {orderSubmitting ? t.preparingOrder : cartStep === "review" ? "التالي" : t.sendViaWhatsapp}
        </button>
      </section>
    </main>
  );
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
  t,
  showPrices
}: {
  data: PublicMenuData;
  product: PublicProduct;
  addToCart: (product: PublicProduct) => void;
  setProductQuantity: (product: PublicProduct, quantity: number) => void;
  getCartQuantity: (slug: string) => number;
  cartCount: number;
  t: PublicTranslations;
  showPrices: boolean;
}) {
  const searchParams = useSearchParams();
  const related = getRelatedProducts(data.products, product);
  const ingredients = productIngredients(product);
  const model3dUrl = product.media?.model3dUrl ?? null;
  const model3dFormat = product.media?.model3dFormat?.toUpperCase() ?? null;
  const canRenderModel = Boolean(model3dUrl && model3dFormat !== "USDZ");
  const gallery = productImages(product);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [mediaMode, setMediaMode] = useState<ProductMediaMode>("image");
  const activeImage = gallery[activeImageIndex] ?? gallery[0];
  const sourceReturnHref = safeInternalHref(searchParams.get("from"));
  const productReturnHref = sourceReturnHref ?? `/m/${data.restaurant.slug}`;
  const currentProductHref = productHref(data.restaurant.slug, product, productReturnHref);
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
    <main className="product-detail">
      <div className="product-photo" onTouchStart={handleGalleryTouchStart} onTouchEnd={handleGalleryTouchEnd}>
        <div className="product-media-tabs" role="group" aria-label={t.photos}>
          <button
            type="button"
            className={mediaMode === "image" ? "active" : ""}
            onClick={() => setMediaMode("image")}
          >
            <ImageIcon size={16} />
            {t.photo}
          </button>
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
              <img src={activeImage.url} alt={activeImage.altText ?? product.name} />
              <a href={model3dUrl} rel="ar">
                <img src={activeImage.url} alt="" aria-hidden="true" />
                فتح 3D على الآيفون
              </a>
            </div>
          )
        ) : (
          <img src={activeImage.url} alt={activeImage.altText ?? product.name} />
        )}
        <button
          type="button"
          className="product-back-link"
          onClick={() => sourceReturnHref ? window.location.assign(sourceReturnHref) : navigateBack(productReturnHref)}
          aria-label="الرجوع"
        >
          <svg className="product-back-arrow-icon" viewBox="0 0 24 20" aria-hidden="true">
            <path d="M9 3.5 15.5 10 9 16.5" />
          </svg>
        </button>
        {mediaMode === "image" && gallery.length > 1 ? (
          <>
            <button type="button" className="product-gallery-arrow product-gallery-prev" onClick={() => moveImage(-1)} aria-label="Previous image">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="product-gallery-arrow product-gallery-next" onClick={() => moveImage(1)} aria-label="Next image">
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
        {mediaMode === "image" ? <span>{activeImageIndex + 1}/{gallery.length}</span> : null}
      </div>
      <section className="product-sheet">
        <div className="product-title-row">
          <h1>{product.name}</h1>
          {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} /> : null}
        </div>
        <p className="product-description" title={product.description ?? undefined}>{product.description}</p>

        {ingredients.length ? (
          <>
            <h2>
              <Flame size={18} />
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

        <h2>
          <Flame size={18} />
          {t.mealDetails}
        </h2>
        <div className="nutrition-card">
          <span>
            <i aria-hidden="true">
              <Scale size={19} />
            </i>
            <small>{t.approximateWeight}</small>
            <b>{product.nutrition?.weight ?? "200 mg"}</b>
          </span>
          <span>
            <i aria-hidden="true">
              {(product.nutrition?.protein ?? t.chicken).toLowerCase().includes("لحم") ? <Beef size={19} /> : <Drumstick size={19} />}
            </i>
            <small>{t.meatType}</small>
            <b>{product.nutrition?.protein ?? t.chicken}</b>
          </span>
          <span>
            <i aria-hidden="true">
              <Wheat size={19} />
            </i>
            <small>{t.breadType}</small>
            <b>{product.nutrition?.breadType ?? t.plate}</b>
          </span>
          <span>
            <i aria-hidden="true">
              <Flame size={19} />
            </i>
            <small>{t.spiceLevel}</small>
            <b>{product.nutrition?.spice ?? t.medium}</b>
          </span>
        </div>

        <ProductRail
          title={t.youMayLike}
          products={related}
          restaurantSlug={data.restaurant.slug}
          t={t}
          fillPlaceholders={false}
          showPrices={showPrices}
          showViewAll={false}
          onAddToCart={addToCart}
          returnHref={currentProductHref}
        />
      </section>
      <div className="product-bottom-cart">
        <QuantityControl
          quantity={quantity}
          onDecrease={() => setProductQuantity(product, quantity - 1)}
          onIncrease={() => addToCart(product)}
          label={product.name}
        />
        <Link href={`/m/${data.restaurant.slug}/cart`} className="product-cart-link">
          <ShoppingBag size={20} />
          <span>{t.viewCart}</span>
          <b>{cartCount}</b>
        </Link>
      </div>
    </main>
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
  showViewAll = true,
  viewAllHref,
  returnHref
}: {
  title: string;
  products: PublicProduct[];
  restaurantSlug: string;
  t: PublicTranslations;
  badgeLabel?: string;
  fillPlaceholders?: boolean;
  showPrices: boolean;
  onAddToCart?: (product: PublicProduct) => void;
  showViewAll?: boolean;
  viewAllHref?: string;
  returnHref?: string;
}) {
  if (!products.length && !fillPlaceholders) {
    return null;
  }

  const railSlots = fillPlaceholders ? Array.from({ length: Math.max(3, products.length) }) : products;

  return (
    <section className="product-rail">
      <div className="rail-head">
        <h2>
          <Flame size={18} />
          {title}
        </h2>
        {showViewAll ? <Link href={viewAllHref ?? `/m/${restaurantSlug}/menu`}>{t.viewAll}</Link> : null}
      </div>
      <div className="rail-scroll">
        {railSlots.map((_, index) => {
          const product = products[index];
          return product ? (
          <article key={`${product.id}-${product.slug}`} className={`rail-product ${onAddToCart ? "rail-product-cartable" : ""}`}>
            {badgeLabel ? <span className="rail-product-badge">{badgeLabel}</span> : null}
            <Link href={productHref(restaurantSlug, product, returnHref)} scroll onClick={() => window.scrollTo(0, 0)}>
              <img src={productImage(product)} alt={product.name} />
            </Link>
            <b>{product.name}</b>
            {showPrices ? <ProductPrice price={productPrice(product)} currency={product.currency} className="rail-price" /> : null}
            {onAddToCart ? (
              <button type="button" onClick={() => onAddToCart(product)} aria-label={`${t.addToCart} ${product.name}`}>
                <ShoppingCart size={14} />
              </button>
            ) : null}
          </article>
          ) : (
            <article key={`rail-placeholder-${index}`} className="rail-product rail-product-placeholder" aria-hidden="true" />
          );
        })}
      </div>
    </section>
  );
}

function BottomNav({
  slug,
  active,
  t,
  showHome,
  showMenu
}: {
  slug: string;
  active: "home" | "menu" | "product" | "cart";
  t: PublicTranslations;
  showHome: boolean;
  showMenu: boolean;
}) {
  const itemCount = [showHome, showMenu].filter(Boolean).length;

  if (itemCount <= 1) {
    return null;
  }

  return (
    <nav className="public-bottom-nav" style={{ "--bottom-nav-count": itemCount } as React.CSSProperties}>
      {showHome ? <Link href={`/m/${slug}`} className={active === "home" ? "active" : ""}>
        <Home size={20} />
        {t.home}
      </Link> : null}
      {showMenu ? <Link href={`/m/${slug}/menu`} className={active === "menu" || active === "product" ? "active" : ""}>
        <Utensils size={20} />
        {t.menu}
      </Link> : null}
    </nav>
  );
}
