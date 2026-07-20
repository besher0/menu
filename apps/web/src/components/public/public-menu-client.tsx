"use client";

import Link from "next/link";
import { createElement, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Beef, CookingPot, Droplet, Drumstick, Fish, Flame, Home, Image as ImageIcon, LayoutGrid, List, Loader2, Menu, MessageCircle, Milk, Minus, Pizza, Plus, Rotate3D, Salad, Sandwich, Scale, ShoppingBag, Soup, Trash2, Utensils, View, Wheat, X } from "lucide-react";
import { PublicCategory, PublicMenuData, PublicProduct, cssVars } from "@/lib/api";

type CartItem = {
  slug: string;
  name: string;
  quantity: number;
  price: number;
  currency: string;
};

type PublicLanguage = "ar" | "en";
type MenuLayout = "list" | "grid";
type ProductMediaMode = "image" | "3d" | "vr";

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
    cartReview: "راجع السلة قبل الإرسال",
    cartTotal: "المجموع",
    orderError: "تعذر إنشاء الطلب، سيتم فتح واتساب مباشرة",
    removeItem: "حذف المنتج",
    emptyCart: "السلة فارغة"
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
    cartReview: "Review your cart before sending",
    cartTotal: "Total",
    orderError: "Could not create the order, opening WhatsApp directly",
    removeItem: "Remove item",
    emptyCart: "Your cart is empty"
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

function productPrice(product: PublicProduct) {
  return product.price ?? product.basePrice;
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

function iconForIngredient(ingredient: string): LucideIcon {
  const value = ingredient.trim().toLowerCase();

  if (["بطاطا", "بطاطس", "fries", "potato"].some((item) => value.includes(item))) return CookingPot;
  if (["مايونيز", "ميونيز", "mayo", "mayonnaise", "صوص", "sauce"].some((item) => value.includes(item))) return Droplet;
  if (["فطر", "mushroom"].some((item) => value.includes(item))) return Soup;
  if (["جبنة", "جبن", "cheese"].some((item) => value.includes(item))) return Milk;
  if (["زنجر", "دجاج", "chicken", "zinger"].some((item) => value.includes(item))) return Drumstick;
  if (["لحم", "برغر", "burger", "beef", "meat"].some((item) => value.includes(item))) return Beef;
  if (["خبز", "صمون", "تورتيلا", "bread", "bun", "tortilla"].some((item) => value.includes(item))) return Wheat;
  if (["سمك", "fish"].some((item) => value.includes(item))) return Fish;
  if (["سلطة", "خس", "salad", "lettuce"].some((item) => value.includes(item))) return Salad;
  if (["بيتزا", "pizza"].some((item) => value.includes(item))) return Pizza;
  if (["ساندويش", "سندويش", "sandwich"].some((item) => value.includes(item))) return Sandwich;

  return Utensils;
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

function sceneViewerUrl(modelUrl: string, title: string, fallbackPath: string) {
  const fileUrl = encodeURIComponent(modelUrl);
  const fallbackUrl = encodeURIComponent(absolutePublicUrl(fallbackPath));
  const encodedTitle = encodeURIComponent(title);

  return `intent://arvr.google.com/scene-viewer/1.0?file=${fileUrl}&mode=ar_preferred&title=${encodedTitle}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${fallbackUrl};end;`;
}

function absolutePublicUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function isSecureModelUrl(modelUrl?: string | null) {
  return Boolean(modelUrl?.startsWith("https://"));
}

function isArFriendlyModel(modelUrl?: string | null, format?: string | null) {
  if (!isSecureModelUrl(modelUrl)) return false;
  const normalizedFormat = format?.toUpperCase();
  const cleanUrl = modelUrl?.split("?")[0]?.toLowerCase() ?? "";
  return normalizedFormat === "GLB" || normalizedFormat === "GLTF" || normalizedFormat === "USDZ" || cleanUrl.endsWith(".glb") || cleanUrl.endsWith(".gltf") || cleanUrl.endsWith(".usdz");
}

export function PublicMenuClient({
  data,
  view,
  productSlug
}: {
  data: PublicMenuData;
  view: "home" | "menu" | "product";
  productSlug?: string;
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [language, setLanguage] = useState<PublicLanguage>("ar");
  const [drawerTab, setDrawerTab] = useState<"info" | "hours">("info");
  const storageKey = `cart:${data.restaurant.slug}:main`;
  const languageStorageKey = `language:${data.restaurant.slug}`;
  const products = data.products;
  const activeProduct = products.find((product) => product.slug === productSlug) ?? products[0];
  const t = translations[language];
  const showPrices = data.restaurant.showPrices ?? true;
  const currency = data.restaurant.currency ?? cart[0]?.currency ?? "ل.س";
  const firstBranch = data.restaurant.branches?.[0];
  const openingHours = formatOpeningHours(firstBranch?.openingHours, language);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      setCart(JSON.parse(stored) as CartItem[]);
    }
  }, [storageKey]);

  useEffect(() => {
    const stored = window.localStorage.getItem(languageStorageKey);
    if (stored === "ar" || stored === "en") {
      setLanguage(stored);
    }
  }, [languageStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(cart));
  }, [cart, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
  }, [language, languageStorageKey]);

  useEffect(() => {
    if (cart.length === 0) {
      setCartOpen(false);
    }
  }, [cart.length]);

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
          currency: product.currency
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}/public/menus/${data.restaurant.slug}/orders/whatsapp`, {
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
    <div className={`public-screen ${showPrices ? "" : "prices-hidden"}`} dir={language === "ar" ? "rtl" : "ltr"} style={cssVars(data.theme)}>
      <header className="public-header">
        {data.restaurant.logoUrl ? <img src={data.restaurant.logoUrl} alt={data.restaurant.name} /> : <span className="public-logo-fallback" />}
        <p>{t.chooseCategory}</p>
        <button onClick={() => setDrawerOpen(true)} aria-label={t.menu}>
          <Menu size={24} />
        </button>
      </header>

      {view === "home" ? (
        <HomeView data={data} addToCart={addToCart} t={t} showPrices={showPrices} />
      ) : view === "menu" ? (
        <MenuView data={data} addToCart={addToCart} t={t} showPrices={showPrices} />
      ) : (
        <ProductView data={data} product={activeProduct} addToCart={addToCart} t={t} showPrices={showPrices} />
      )}

      {cartCount > 0 ? (
        <div className={`sticky-cart ${cartOpen ? "open" : ""} ${showPrices ? "" : "prices-hidden"}`}>
          <div className="cart-head">
          <button
            type="button"
            className="cart-summary"
            onClick={() => setCartOpen((current) => !current)}
            aria-expanded={cartOpen}
          >
            <span className="cart-summary-icon">
              <ShoppingBag size={18} />
              <b>{cartCount}</b>
            </span>
            <span>
              <b>{cartOpen ? t.hideCart : t.cart}</b>
              <small>{cartTotal} {data.restaurant.currency ?? "ل.س"}</small>
            </span>
          </button>
          <span className="cart-total-pill">
            <small>{t.cartTotal}</small>
            <b>{cartTotal} {data.restaurant.currency ?? "ل.س"}</b>
          </span>
          </div>

          {cartOpen ? (
            <div className="cart-edit-panel">
              {cart.map((item) => (
                <article key={item.slug} className="cart-edit-row">
                  <div>
                    <b>{item.name}</b>
                    <span>{item.price * item.quantity} {item.currency}</span>
                  </div>
                  <div className="cart-quantity">
                    <button
                      type="button"
                      onClick={() => updateCartItem(item.slug, item.quantity - 1)}
                      aria-label={`- ${item.name}`}
                    >
                      <Minus size={14} />
                    </button>
                    <strong>{item.quantity}</strong>
                    <button
                      type="button"
                      onClick={() => updateCartItem(item.slug, item.quantity + 1)}
                      aria-label={`+ ${item.name}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cart-remove"
                    onClick={() => removeCartItem(item.slug)}
                    aria-label={`${t.removeItem} ${item.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          ) : null}
            <span>{cartTotal} {data.restaurant.currency ?? "ل.س"}</span>
          {orderMessage ? <p className="cart-message">{orderMessage}</p> : null}
          <button
            type="button"
            className="cart-whatsapp"
            onClick={sendWhatsappOrder}
            disabled={orderSubmitting}
          >
            {orderSubmitting ? <Loader2 size={18} className="spin" /> : <MessageCircle size={18} />}
            {orderSubmitting ? t.preparingOrder : t.sendOrder}
          </button>
        </div>
      ) : null}

      <BottomNav slug={data.restaurant.slug} active={view} t={t} />

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
          {[t.complaints, t.social, t.questions, t.rating].map((item) => (
            <button key={item}>
              <span>{item}</span>
              <ArrowLeft size={18} />
            </button>
          ))}
          <div className="drawer-tabs" role="tablist" aria-label="معلومات المطعم">
            <button type="button" className={drawerTab === "info" ? "active" : ""} onClick={() => setDrawerTab("info")}>
              معلومات
            </button>
            <button type="button" className={drawerTab === "hours" ? "active" : ""} onClick={() => setDrawerTab("hours")}>
              أوقات الدوام
            </button>
          </div>
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
  const featuredSlots = Array.from({ length: Math.max(2, featured.slice(0, 2).length) });
  const allPages = data.menus?.flatMap((menu) => menu.pages ?? []) ?? [];
  const homePage = allPages.find((page) => page.isHome && page.sections?.some((section) => section.type === "HERO" && section.isActive !== false))
    ?? allPages.find((page) => page.isHome)
    ?? allPages[0];
  const heroSection = homePage?.sections?.find((section) => section.type === "HERO" && section.isActive !== false);
  const moodSection = homePage?.sections?.find((section) => section.type === "MOOD_STRIP" && section.isActive !== false);
  const moodItems: MoodItem[] = moodSection?.settings?.moodItems?.length
    ? moodSection.settings.moodItems.map((item) => ({
        label: item.label,
        href: item.targetUrl || `/m/${data.restaurant.slug}/menu`,
        iconUrl: item.iconUrl,
        iconPosition: "manual",
        iconX: item.iconX,
        iconY: item.iconY,
        color: item.color,
        backgroundType: item.backgroundType,
        backgroundValue: item.backgroundValue,
        backgroundCss: item.backgroundCss,
        visualScrollEnabled: item.visualScrollEnabled
      }))
    : data.categories.map((category) => {
        const position = parseIconPosition(category.imagePosition);
        return {
          label: category.name,
          href: `/m/${data.restaurant.slug}/menu`,
          iconUrl: category.imageUrl ?? undefined,
          iconPosition: position.mode,
          iconX: position.x,
          iconY: position.y,
          color: category.color ?? undefined,
          backgroundType: category.backgroundType,
          backgroundValue: category.backgroundValue,
          backgroundCss: category.backgroundCss,
          visualScrollEnabled: category.visualScrollEnabled
        };
      });
  const moodSlots = Array.from({ length: Math.max(4, moodItems.length) });
  const heroImage = heroSection?.settings?.backgroundImageUrl || data.restaurant.heroImageUrl || "/assets/public/menu-home.png";
  const adBanners = heroSection?.settings?.adBanners?.filter((banner) => banner.imageUrl && banner.isActive !== false) ?? [];
  const bannerSlides = adBanners.length
    ? adBanners
    : [{ imageUrl: heroImage, title: t.todayOffer, targetUrl: `/m/${data.restaurant.slug}/menu` }];
  const [activeBanner, setActiveBanner] = useState(0);
  const currentBanner = bannerSlides[activeBanner] ?? bannerSlides[0];

  function moveBanner(direction: -1 | 1) {
    setActiveBanner((current) => (current + direction + bannerSlides.length) % bannerSlides.length);
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
                  className={`mood-chip ${item.visualScrollEnabled ? "visual-scroll" : ""}`}
                  style={{
                    ...visualBackgroundStyle(item),
                    "--icon-x": `${item.iconX ?? 78}%`,
                    "--icon-y": `${item.iconY ?? 50}%`
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

      <section className="hero-promo">
        <Link href={currentBanner?.targetUrl || `/m/${data.restaurant.slug}/menu`}>
          <img src={currentBanner?.imageUrl ?? heroImage} alt={currentBanner?.title || t.todayOffer} />
          {currentBanner?.badge ? <span>{currentBanner.badge}</span> : null}
        </Link>
        {bannerSlides.length > 1 ? (
          <>
            <button className="hero-promo-arrow prev" type="button" onClick={() => moveBanner(-1)} aria-label="السابق">
              ‹
            </button>
            <button className="hero-promo-arrow next" type="button" onClick={() => moveBanner(1)} aria-label="التالي">
              ›
            </button>
            <div className="hero-promo-dots">
              {bannerSlides.map((banner, index) => (
                <button
                  key={`${banner.imageUrl}-${index}`}
                  type="button"
                  className={index === activeBanner ? "active" : ""}
                  onClick={() => setActiveBanner(index)}
                  aria-label={`بنر ${index + 1}`}
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
        badgeLabel={t.mostPopular}
        showPrices={showPrices}
      />

      <section className="new-grid">
        <div className="rail-head">
          <h2>{t.newItems}</h2>
          <Link href={`/m/${data.restaurant.slug}/menu`}>{t.viewAll}</Link>
        </div>
        <div>
          {featuredSlots.map((_, index) => {
            const product = featured[index];
            return product ? (
            <Link key={product.slug} href={`/m/${data.restaurant.slug}/product/${product.slug}`} className="wide-product">
              <img src={productImage(product)} alt={product.name} />
              <span className="wide-product-badge">{t.newBadge}</span>
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
  t,
  showPrices
}: {
  data: PublicMenuData;
  addToCart: (product: PublicProduct) => void;
  t: PublicTranslations;
  showPrices: boolean;
}) {
  const [layout, setLayout] = useState<MenuLayout>("list");
  const allCategory = data.categories.find((category) => category.slug === "all");

  return (
    <main className="public-content">
      <section className="category-banner-list" id="menu-categories">
        {data.categories.map((category) => {
          const position = parseIconPosition(category.imagePosition);
          const isAllCategory = category.slug === "all";
          const productsCount = isAllCategory ? data.products.length : category.productsCount ?? category.count ?? 0;

          return (
            <Link
              key={category.slug}
              href={isAllCategory ? "#all-products" : `#${category.slug}`}
              className={category.visualScrollEnabled ? "visual-scroll" : ""}
              style={{
                ...visualBackgroundStyle(category),
                "--category-overlay": category.backgroundOverlay ?? undefined,
                "--category-image-x": `${position.x}%`,
                "--category-image-y": `${position.y}%`
              } as React.CSSProperties}
            >
              {category.imageUrl ? (
                <img
                  src={category.imageUrl}
                  alt=""
                  aria-hidden="true"
                  ref={(image) => {
                    if (!image) return;
                    requestAnimationFrame(() => {
                      image.parentElement?.style.setProperty("--category-image-half-width", `${image.getBoundingClientRect().width / 2}px`);
                    });
                  }}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    image.parentElement?.style.setProperty("--category-image-half-width", `${image.getBoundingClientRect().width / 2}px`);
                  }}
                />
              ) : null}
              <div className="category-banner-copy">
                <span>{category.name}</span>
                <small>{category.description}</small>
                <b>{productsCount} {t.itemCount}</b>
              </div>
              <ArrowLeft size={22} />
            </Link>
          );
        })}
      </section>

      <div className="menu-view-switch" role="group" aria-label={t.menu}>
        <button
          type="button"
          className={layout === "list" ? "active" : ""}
          onClick={() => setLayout("list")}
          aria-label={t.listView}
          title={t.listView}
        >
          <List size={18} />
        </button>
        <button
          type="button"
          className={layout === "grid" ? "active" : ""}
          onClick={() => setLayout("grid")}
          aria-label={t.gridView}
          title={t.gridView}
        >
          <LayoutGrid size={18} />
        </button>
      </div>

      <section className={`product-list product-list-${layout}`}>
        <div id="all-products">
          <h2 className="category-section-title">
            <span>{allCategory?.name ?? "الكل"}</span>
          </h2>
          <div className={layout === "grid" ? "menu-product-grid" : "menu-product-stack"}>
            {data.products.map((product) => (
              <article key={product.slug} className={layout === "grid" ? "menu-product-card" : "menu-product-row"}>
                <Link href={`/m/${data.restaurant.slug}/product/${product.slug}`} className="menu-product-image-link">
                  <img src={productImage(product)} alt={product.name} />
                  {isPopular(product) ? <span>{t.mostPopular}</span> : null}
                </Link>
                <div>
                  <Link href={`/m/${data.restaurant.slug}/product/${product.slug}`}>{product.name}</Link>
                  <p>{product.description}</p>
                  {showPrices ? <strong>{productPrice(product)} {product.currency}</strong> : null}
                </div>
                <button onClick={() => addToCart(product)} aria-label={`${t.add} ${product.name}`}>
                  <Plus size={18} />
                </button>
              </article>
            ))}
          </div>
        </div>
        {data.categories.filter((category) => category.slug !== "all").map((category) => {
          const products = data.products.filter((product) => (product.category?.slug ?? product.categorySlug) === category.slug);
          if (!products.length) {
            return null;
          }

          return (
            <div key={category.slug} id={category.slug}>
              <h2 className="category-section-title">
                <span>{category.name}</span>
              </h2>
              <div className={layout === "grid" ? "menu-product-grid" : "menu-product-stack"}>
                {products.map((product) => (
                  <article key={product.slug} className={layout === "grid" ? "menu-product-card" : "menu-product-row"}>
                    <Link href={`/m/${data.restaurant.slug}/product/${product.slug}`} className="menu-product-image-link">
                      <img src={productImage(product)} alt={product.name} />
                      {isPopular(product) ? <span>{t.mostPopular}</span> : null}
                    </Link>
                    <div>
                      <Link href={`/m/${data.restaurant.slug}/product/${product.slug}`}>{product.name}</Link>
                      <p>{product.description}</p>
                      {showPrices ? <strong>{productPrice(product)} {product.currency}</strong> : null}
                    </div>
                    <button onClick={() => addToCart(product)} aria-label={`${t.add} ${product.name}`}>
                      <Plus size={18} />
                    </button>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}

function ProductView({
  data,
  product,
  addToCart,
  t,
  showPrices
}: {
  data: PublicMenuData;
  product: PublicProduct;
  addToCart: (product: PublicProduct) => void;
  t: PublicTranslations;
  showPrices: boolean;
}) {
  const related = getRelatedProducts(data.products, product);
  const model3dUrl = product.media?.model3dUrl ?? null;
  const model3dFormat = product.media?.model3dFormat ?? null;
  const vrUrl = product.media?.vrUrl ?? null;
  const canOpenAr = isArFriendlyModel(model3dUrl, model3dFormat);
  const gallery = productImages(product);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [mediaMode, setMediaMode] = useState<ProductMediaMode>("image");
  const [realArAvailable, setRealArAvailable] = useState(false);
  const activeImage = gallery[activeImageIndex] ?? gallery[0];

  useEffect(() => {
    if (!model3dUrl || document.querySelector("script[data-model-viewer]")) {
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";
    script.dataset.modelViewer = "true";
    document.head.appendChild(script);
  }, [model3dUrl]);

  useEffect(() => {
    setActiveImageIndex(0);
    setMediaMode("image");
    setRealArAvailable(false);
  }, [product.slug]);

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

  async function trackMediaOpen(type: "THREE_D_VIEW_OPENED" | "VR_VIEW_OPENED") {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}/public/menus/${data.restaurant.slug}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          path: `/m/${data.restaurant.slug}/product/${product.slug}`,
          metadata: { productSlug: product.slug }
        })
      });
    } catch {
      // Tracking must not interrupt the public menu.
    }
  }

  return (
    <main className="product-detail">
      <div className="product-photo">
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
                void trackMediaOpen("THREE_D_VIEW_OPENED");
              }}
            >
              <Rotate3D size={16} />
              3D
            </button>
          ) : null}
          {vrUrl ? (
            <button
              type="button"
              className={mediaMode === "vr" ? "active" : ""}
              onClick={() => {
                setMediaMode("vr");
                void trackMediaOpen("VR_VIEW_OPENED");
              }}
            >
              <View size={16} />
              VR
            </button>
          ) : null}
        </div>
        {mediaMode === "3d" && model3dUrl ? (
          <div className="product-model-stage">
            {createElement("model-viewer", {
              src: model3dUrl,
              ...(model3dFormat === "USDZ" && canOpenAr ? { "ios-src": model3dUrl } : {}),
              ...(canOpenAr ? { ar: true } : {}),
              "ar-modes": "scene-viewer webxr quick-look",
              "camera-controls": true,
              "auto-rotate": true,
              "camera-orbit": "0deg 72deg auto",
              "min-camera-orbit": "auto 18deg auto",
              "max-camera-orbit": "auto 92deg auto",
              "interaction-prompt": "auto",
              "disable-pan": true,
              "shadow-intensity": "1",
              loading: "lazy",
              ref: (element: HTMLElement | null) => {
                if (!element || element.dataset.arListener === "true") return;
                element.dataset.arListener = "true";
                element.addEventListener("ar-status", (event) => {
                  const status = (event as CustomEvent<{ status?: string }>).detail?.status;
                  if (status === "session-started" || status === "object-placed" || status === "not-presenting") {
                    setRealArAvailable(true);
                  }
                  if (status === "failed") {
                    setRealArAvailable(false);
                  }
                });
              },
              style: { width: "100%", height: "100%", display: "block" }
            }, realArAvailable ? createElement("button", { slot: "ar-button", className: "model-ar-button", type: "button" }, "AR") : null)}
            {canOpenAr && realArAvailable ? (
              <a className="model-ar-direct" href={sceneViewerUrl(model3dUrl, product.name, `/m/${data.restaurant.slug}/product/${product.slug}`)}>
                فتح AR مباشر
              </a>
            ) : null}
            {!canOpenAr || !realArAvailable ? (
              <small className="model-ar-note">{canOpenAr ? "جهازك أو المتصفح لا يدعم AR الحقيقي. يمكنك مشاهدة المنتج بتقنية 3D فقط." : "AR يحتاج رابط HTTPS مباشر وملف GLB/GLTF أو USDZ"}</small>
            ) : null}
          </div>
        ) : mediaMode === "vr" && vrUrl ? (
          <div className="product-vr-stage">
            <iframe src={vrUrl} title={`${product.name} VR`} loading="lazy" />
            <a href={vrUrl} target="_blank" rel="noreferrer" onClick={() => void trackMediaOpen("VR_VIEW_OPENED")}>
              {t.openVr}
            </a>
          </div>
        ) : (
          <img src={activeImage.url} alt={activeImage.altText ?? product.name} />
        )}
        <Link href={`/m/${data.restaurant.slug}/menu`}>
          <ArrowLeft size={18} />
        </Link>
        <span>{activeImageIndex + 1}/{gallery.length}</span>
      </div>
      {gallery.length > 1 ? (
        <div className="product-thumbnails" aria-label={t.photos}>
          {gallery.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              className={mediaMode === "image" && index === activeImageIndex ? "active" : ""}
              onClick={() => {
                setActiveImageIndex(index);
                setMediaMode("image");
              }}
              aria-label={`${t.photo} ${index + 1}`}
            >
              <img src={image.url} alt="" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
      <section className="product-sheet">
        <div className="product-title-row">
          <h1>{product.name}</h1>
          {showPrices ? <strong>{productPrice(product)} {product.currency}</strong> : null}
        </div>
        <p>{product.description}</p>

        <div className="ar-card">
          <img src={productImage(product)} alt={product.name} />
          <div>
            <b>{t.viewMealRealSize}</b>
            <span>{t.arHint}</span>
            {model3dUrl ? (
              <div className="ar-card-actions">
                <button
                  type="button"
                  onClick={() => {
                    setMediaMode("3d");
                    void trackMediaOpen("THREE_D_VIEW_OPENED");
                  }}
                >
                  {t.open3d}
                </button>
                {canOpenAr && realArAvailable ? <span>AR الحقيقي متاح على جهازك</span> : <span>AR الحقيقي يحتاج جهازاً مدعوماً</span>}
              </div>
            ) : (
              <button type="button" disabled>{t.tryAr}</button>
            )}
          </div>
        </div>

        <h2>
          <Flame size={18} />
          {t.mealIncludes}
        </h2>
        {model3dUrl || vrUrl ? (
          <div className="media-view-card">
            <b>3D / VR</b>
            <div className="media-view-actions">
              {model3dUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    setMediaMode("3d");
                    void trackMediaOpen("THREE_D_VIEW_OPENED");
                  }}
                >
                  <Rotate3D size={16} />
                  {t.open3d}
                </button>
              ) : null}
              {vrUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    setMediaMode("vr");
                    void trackMediaOpen("VR_VIEW_OPENED");
                  }}
                >
                  <View size={16} />
                  {t.openVr}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="ingredients-row">
          {(product.ingredients?.length ? product.ingredients : ["بطاطا", "مايونيز", "فطر", "جبنة"]).map((ingredient) => {
            const IngredientIcon = iconForIngredient(ingredient);
            return (
              <span key={ingredient}>
                <i aria-hidden="true">
                  <IngredientIcon size={22} />
                </i>
                <b>{ingredient}</b>
              </span>
            );
          })}
        </div>

        <h2>
          <Flame size={18} />
          {t.mealDetails}
        </h2>
        <div className="nutrition-card">
          <span>
            <i aria-hidden="true">
              <Scale size={19} />
            </i>
            {t.approximateWeight}
            <b>{product.nutrition?.weight ?? "200 mg"}</b>
          </span>
          <span>
            <i aria-hidden="true">
              {(product.nutrition?.protein ?? t.chicken).toLowerCase().includes("لحم") ? <Beef size={19} /> : <Drumstick size={19} />}
            </i>
            {t.meatType}
            <b>{product.nutrition?.protein ?? t.chicken}</b>
          </span>
          <span>
            <i aria-hidden="true">
              <Wheat size={19} />
            </i>
            {t.breadType}
            <b>{product.nutrition?.breadType ?? t.plate}</b>
          </span>
          <span>
            <i aria-hidden="true">
              <Flame size={19} />
            </i>
            {t.spiceLevel}
            <b>{product.nutrition?.spice ?? t.medium}</b>
          </span>
        </div>

        <button className="add-large" onClick={() => addToCart(product)}>
          <ShoppingBag size={20} />
          {t.addToCart}
        </button>

        <ProductRail
          title={t.youMayLike}
          products={related}
          restaurantSlug={data.restaurant.slug}
          t={t}
          fillPlaceholders={false}
          showPrices={showPrices}
        />
      </section>
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
  showPrices
}: {
  title: string;
  products: PublicProduct[];
  restaurantSlug: string;
  t: PublicTranslations;
  badgeLabel?: string;
  fillPlaceholders?: boolean;
  showPrices: boolean;
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
        <Link href={`/m/${restaurantSlug}/menu`}>{t.viewAll}</Link>
      </div>
      <div className="rail-scroll">
        {railSlots.map((_, index) => {
          const product = products[index];
          return product ? (
          <article key={product.slug} className="rail-product">
            {badgeLabel ? <span className="rail-product-badge">{badgeLabel}</span> : null}
            <Link href={`/m/${restaurantSlug}/product/${product.slug}`}>
              <img src={productImage(product)} alt={product.name} />
            </Link>
            <b>{product.name}</b>
            {showPrices ? <small>{productPrice(product)} {product.currency}</small> : null}
          </article>
          ) : (
            <article key={`rail-placeholder-${index}`} className="rail-product rail-product-placeholder" aria-hidden="true" />
          );
        })}
      </div>
    </section>
  );
}

function BottomNav({ slug, active, t }: { slug: string; active: "home" | "menu" | "product"; t: PublicTranslations }) {
  return (
    <nav className="public-bottom-nav">
      <Link href={`/m/${slug}`} className={active === "home" ? "active" : ""}>
        <Home size={20} />
        {t.home}
      </Link>
      <Link href={`/m/${slug}/menu`} className={active === "menu" || active === "product" ? "active" : ""}>
        <Utensils size={20} />
        {t.menu}
      </Link>
    </nav>
  );
}
