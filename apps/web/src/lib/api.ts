import {
  ABO_MALEK_THEME,
  themeToCssVariables,
  type ConfigurationIssue,
  type PriceLine,
  type ProductConfigurationV1,
  type ProductSelectionV1,
  type ThemeSettings
} from "@menu/shared";

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
  displayName?: string;
  imageUrl?: string | null;
};

export type PublicMealDetail = {
  label: string;
  displayName?: string;
  value: string;
  icon?: string | null;
  iconUrl?: string | null;
};

export type PublicProduct = {
  id?: string;
  slug: string;
  name: string;
  description?: string | null;
  basePrice: number | null;
  price?: number | string | null;
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
  moodKeys?: string[];
  ingredients?: PublicIngredient[];
  nutrition?: {
    details?: PublicMealDetail[];
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
  productConfiguration?: {
    mode: "NETWORK";
    configurationRevision: number;
    orderable: boolean;
    previewOnly: true;
    minimumPrice: string | null;
    priceDisplay: "EXACT" | "STARTING_AT" | "UNAVAILABLE";
    issueCodes: string[];
  };
};

export type PublicLinkedConfigurationSource = {
  productId: string;
  slug: string;
  name: string;
  mode: "NETWORK" | "LEGACY";
  available: boolean;
  orderable: boolean;
  configuration: ProductConfigurationV1;
};

export type PublicProductConfigurationResponse = {
  schemaVersion: 1;
  productId: string;
  productSlug: string;
  productName: string;
  configurationRevision: number;
  configuration: ProductConfigurationV1;
  linkedProducts: PublicLinkedConfigurationSource[];
  orderable: boolean;
  previewOnly: true;
  orderAction: "STAGE_6_REQUIRED";
  minimumPrice: string | null;
  maximumRequiredPrice: string | null;
  priceDisplay: "EXACT" | "STARTING_AT" | "UNAVAILABLE";
  issues: ConfigurationIssue[];
  runtimeContext: {
    scope: "RESTAURANT";
    outletDifferentialApplied: false;
    serviceModeApplied: false;
    productScheduleApplied: false;
  };
};

export type PublicProductQuoteResponse = {
  schemaVersion: 1;
  productId: string;
  configurationRevision: number;
  selectionKey: string;
  canonicalSelection: ProductSelectionV1;
  currency: string;
  trustedTotal: string;
  baseIgnored: boolean;
  priceBreakdown: PriceLine[];
  linkedSourceRevisions: { sourceProductId: string; mode: "NETWORK" | "LEGACY"; configurationRevision: number }[];
  configurationOrderable: true;
  previewOnly: true;
  orderAction: "STAGE_6_REQUIRED";
  orderingEnabled: false;
  runtimeContext: PublicProductConfigurationResponse["runtimeContext"];
};

export class PublicProductQuoteError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
    readonly issues: ConfigurationIssue[] = [],
    readonly currentRevision?: number
  ) {
    super(message);
    this.name = "PublicProductQuoteError";
  }
}

export type PublicMenuData = {
  restaurant: {
    slug: string;
    name: string;
    type?: string | null;
    city?: string | null;
    country?: string | null;
    whatsappPhone?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    tiktokUrl?: string | null;
    whatsappUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    description?: string | null;
    logoUrl?: string | null;
    heroImageUrl?: string | null;
    splashScreen?: {
      logoUrl?: string | null;
      backgroundType: "COLOR" | "IMAGE";
      backgroundColor?: string | null;
      backgroundImageUrl?: string | null;
      logoX: number;
      logoY: number;
    };
    currency?: string | null;
    showPrices?: boolean;
    productOpenMode?: "MODAL" | "PAGE";
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
          subtitle?: string;
          cardVariant?: string;
          categoryNavVariant?: string;
          showHomePage?: boolean;
          showLandingCategories?: boolean;
          showNestedCategoryStrip?: boolean;
          adBanners?: Array<{
            title?: string;
            subtitle?: string;
            imageUrl: string;
            targetUrl?: string;
            targetProductId?: string;
            badge?: string;
            isActive?: boolean;
          }>;
          moodItems?: Array<{
            key?: string;
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export class PublicMenuApiError extends Error {
  constructor(
    message: string,
    readonly kind: "not-found" | "http" | "network",
    readonly status?: number
  ) {
    super(message);
    this.name = "PublicMenuApiError";
  }
}

export function isPublicMenuNotFoundError(error: unknown) {
  return error instanceof PublicMenuApiError && error.kind === "not-found";
}

async function apiGet<T>(path: string): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new PublicMenuApiError("Public menu was not found.", "not-found", 404);
      }

      throw new PublicMenuApiError(`Public menu API failed with HTTP ${response.status}.`, "http", response.status);
    }

    const payload = (await response.json()) as ApiResponse<T> | T;
    return "data" in (payload as ApiResponse<T>) ? (payload as ApiResponse<T>).data : (payload as T);
  } catch (error) {
    if (error instanceof PublicMenuApiError) {
      throw error;
    }

    throw new PublicMenuApiError("Public menu API request failed.", "network");
  }
}

export async function getPublicMenu(slug: string, options: { track?: boolean } = {}): Promise<PublicMenuData> {
  const track = options.track === false ? "?track=0" : "";
  return apiGet<PublicMenuData>(`/public/menus/${slug}${track}`);
}

export async function getPublicProductConfiguration(
  restaurantSlug: string,
  productId: string
): Promise<PublicProductConfigurationResponse> {
  return apiGet<PublicProductConfigurationResponse>(
    `/public/menus/${encodeURIComponent(restaurantSlug)}/products/${encodeURIComponent(productId)}/configuration`
  );
}

export async function getPublicProductQuote(
  restaurantSlug: string,
  productId: string,
  selection: ProductSelectionV1,
  signal?: AbortSignal
): Promise<PublicProductQuoteResponse> {
  let response: Response;
  try {
    response = await fetch(
      `${API_URL}/public/menus/${encodeURIComponent(restaurantSlug)}/products/${encodeURIComponent(productId)}/quote`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selection }), cache: "no-store", signal }
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PublicProductQuoteError("تعذر الاتصال بخدمة التحقق من السعر.", null, "QUOTE_NETWORK_FAILURE");
  }
  const payload = await response.json().catch(() => null) as {
    data?: PublicProductQuoteResponse;
    error?: string;
    message?: string;
    issues?: ConfigurationIssue[];
    currentRevision?: number;
  } | null;
  if (!response.ok) {
    throw new PublicProductQuoteError(
      payload?.message ?? "تعذر التحقق من التكوين الحالي.",
      response.status,
      payload?.error ?? "QUOTE_HTTP_FAILURE",
      Array.isArray(payload?.issues) ? payload.issues : [],
      payload?.currentRevision
    );
  }
  if (!payload?.data) throw new PublicProductQuoteError("استجابة Quote غير صالحة.", response.status, "QUOTE_RESPONSE_INVALID");
  return payload.data;
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
