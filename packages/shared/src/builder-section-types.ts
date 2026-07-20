export const BUILDER_SECTION_TYPES = [
  "HERO",
  "MOOD_STRIP",
  "CATEGORY_GRID",
  "FEATURED_PRODUCTS",
  "PRODUCT_LIST",
  "GALLERY",
  "ABOUT",
  "OPENING_HOURS",
  "CONTACT",
  "OFFERS",
  "QR_CODE",
  "SOCIAL_LINKS"
] as const;

export type BuilderSectionType = (typeof BUILDER_SECTION_TYPES)[number];

export type BuilderSectionSettings = {
  title?: string;
  subtitle?: string;
  description?: string;
  backgroundImageUrl?: string;
  buttonText?: string;
  buttonTarget?: string;
  layout?: string;
  alignment?: "start" | "center" | "end";
  height?: "small" | "medium" | "large";
  adBanners?: Array<{
    title?: string;
    subtitle?: string;
    imageUrl: string;
    targetUrl?: string;
    badge?: string;
  }>;
  moodItems?: Array<{
    label: string;
    targetUrl?: string;
    iconUrl?: string;
    iconPosition?: "start" | "end" | "top" | "bottom" | "manual";
    iconX?: number;
    iconY?: number;
    color?: string;
    backgroundType?: "COLOR" | "IMAGE" | "TEXTURE" | "PATTERN" | "GRADIENT";
    backgroundValue?: string | null;
    backgroundCss?: string | null;
    visualScrollEnabled?: boolean;
  }>;
};

export type BuilderSection = {
  id: string;
  type: BuilderSectionType;
  sortOrder: number;
  isActive: boolean;
  settings: BuilderSectionSettings;
};

export const SECTION_LABELS: Record<BuilderSectionType, string> = {
  HERO: "الهيرو",
  MOOD_STRIP: "شو مزاجك اليوم",
  CATEGORY_GRID: "شبكة الأقسام",
  FEATURED_PRODUCTS: "الأكثر طلباً",
  PRODUCT_LIST: "قائمة المنتجات",
  GALLERY: "معرض الصور",
  ABOUT: "من نحن",
  OPENING_HOURS: "أوقات العمل",
  CONTACT: "التواصل",
  OFFERS: "العروض",
  QR_CODE: "رمز QR",
  SOCIAL_LINKS: "التواصل الاجتماعي"
};

export function defaultSectionSettings(type: BuilderSectionType): BuilderSectionSettings {
  switch (type) {
    case "HERO":
      return {
        title: "أهلاً بك",
        subtitle: "اختار أحد الأصناف وتصفح",
        backgroundImageUrl: "/assets/public/menu-home.png",
        adBanners: [
          {
            title: "عرض اليوم",
            subtitle: "أضف صورة البنر الإعلاني من منشئ الواجهة",
            imageUrl: "/assets/public/menu-home.png",
            targetUrl: "/menu",
            badge: "جديد"
          }
        ],
        buttonText: "عرض القائمة",
        buttonTarget: "#menu",
        alignment: "center",
        height: "large"
      };
    case "CATEGORY_GRID":
      return { title: "الأقسام", layout: "horizontal-chips" };
    case "MOOD_STRIP":
      return {
        title: "شو مزاجك اليوم؟",
        layout: "horizontal-chips",
        moodItems: [
          { label: "سريع وخفيف", iconX: 78, iconY: 50, color: "#d32f2f" },
          { label: "جوعان كثير", iconX: 78, iconY: 50, color: "#c81e1e" },
          { label: "عشاق الجبنة", iconX: 78, iconY: 50, color: "#d99a1e" }
        ]
      };
    case "FEATURED_PRODUCTS":
      return { title: "الأكثر طلباً", layout: "rail" };
    case "PRODUCT_LIST":
      return { title: "القائمة", layout: "list" };
    case "ABOUT":
      return { title: "من نحن", description: "اكتب قصة المطعم هنا." };
    case "OPENING_HOURS":
      return { title: "أوقات العمل", description: "يوميًا من 10 صباحًا حتى 12 مساءً." };
    case "CONTACT":
      return { title: "تواصل معنا", description: "واتساب، موقع الفرع، وروابط التواصل." };
    case "OFFERS":
      return { title: "عروض اليوم", layout: "cards" };
    case "QR_CODE":
      return { title: "امسح QR", description: "شارك المنيو بسرعة." };
    case "SOCIAL_LINKS":
      return { title: "تابعنا", layout: "icons" };
    case "GALLERY":
    default:
      return { title: "معرض الصور", layout: "grid" };
  }
}
