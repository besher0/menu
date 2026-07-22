import { ABO_MALEK_THEME, themeToCssVariables, ThemeSettings } from "@menu/shared";

export type PublicCategory = {
  id?: string;
  slug: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  imagePosition?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  color?: string | null;
  backgroundType?: "COLOR" | "IMAGE" | "TEXTURE" | "PATTERN" | "GRADIENT";
  backgroundValue?: string | null;
  backgroundOverlay?: string | null;
  backgroundCss?: string | null;
  visualScrollEnabled?: boolean;
  productsCount?: number;
  count?: number;
};

export type PublicIngredient = string | {
  name: string;
  imageUrl?: string | null;
};

export type PublicProduct = {
  id?: string;
  slug: string;
  name: string;
  description?: string | null;
  basePrice: number;
  price?: number;
  currency: string;
  imageUrl?: string | null;
  images?: Array<{ url: string; altText?: string | null }>;
  isFeatured?: boolean;
  isNew?: boolean;
  isPopular?: boolean;
  featured?: boolean;
  new?: boolean;
  popular?: boolean;
  moodKey?: string | null;
  ingredients?: PublicIngredient[];
  nutrition?: {
    calories?: string;
    protein?: string;
    weight?: string;
    breadType?: string;
    spice?: string;
  } | null;
  category?: { slug: string; name: string } | null;
  categorySlug?: string;
  media?: {
    model3dUrl?: string | null;
    model3dFormat?: string | null;
    vrUrl?: string | null;
    vrType?: string | null;
    has3d?: boolean;
    hasVr?: boolean;
  };
};

export type PublicMenuData = {
  restaurant: {
    slug: string;
    name: string;
    type?: string | null;
    city?: string | null;
    country?: string | null;
    whatsappPhone?: string | null;
    phone?: string | null;
    email?: string | null;
    description?: string | null;
    logoUrl?: string | null;
    heroImageUrl?: string | null;
    currency?: string | null;
    showPrices?: boolean;
    branches?: Array<{
      id: string;
      name: string;
      address?: string | null;
      city?: string | null;
      whatsappPhone?: string | null;
      openingHours?: Array<Record<string, unknown>> | Record<string, unknown> | null;
    }>;
  };
  categories: PublicCategory[];
  products: PublicProduct[];
  theme: ThemeSettings;
  menus?: Array<{
    pages?: Array<{
      isHome?: boolean;
      sections?: Array<{
        type: string;
        isActive?: boolean;
        settings?: {
          backgroundImageUrl?: string;
          title?: string;
          adBanners?: Array<{
            title?: string;
            subtitle?: string;
            imageUrl: string;
            targetUrl?: string;
            badge?: string;
            isActive?: boolean;
          }>;
          moodItems?: Array<{
            label: string;
            targetUrl?: string;
            iconUrl?: string;
            iconPosition?: "start" | "end" | "top" | "bottom" | "manual";
            iconX?: number;
            iconY?: number;
            iconWidth?: number;
            iconHeight?: number;
            color?: string;
            backgroundType?: "COLOR" | "IMAGE" | "TEXTURE" | "PATTERN" | "GRADIENT";
            backgroundValue?: string | null;
            backgroundCss?: string | null;
            visualScrollEnabled?: boolean;
          }>;
        } | null;
      }>;
    }>;
  }>;
};

type ApiResponse<T> = {
  data: T;
  meta?: Record<string, unknown>;
  message?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5010";

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiResponse<T> | T;
    return "data" in (payload as ApiResponse<T>) ? (payload as ApiResponse<T>).data : (payload as T);
  } catch {
    return null;
  }
}

export async function getPublicMenu(slug: string, options: { track?: boolean } = {}): Promise<PublicMenuData> {
  const track = options.track === false ? "?track=0" : "";
  const apiMenu = await apiGet<PublicMenuData>(`/public/menus/${slug}${track}`);
  return apiMenu ?? emptyPublicMenu(slug);
}

export function emptyPublicMenu(slug = "restaurant"): PublicMenuData {
  return {
    restaurant: {
      slug,
      name: "مطعم جديد",
      currency: "ل.س"
    },
    categories: [],
    products: [],
    theme: ABO_MALEK_THEME
  };
}

export function cssVars(theme: ThemeSettings) {
  return themeToCssVariables(theme) as React.CSSProperties;
}
