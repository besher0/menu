export const FEATURE_KEYS = [
  "PRODUCT_IMAGES",
  "PRODUCT_3D_VIEWER",
  "PRODUCT_VR_VIEWER",
  "CART_ORDERING",
  "WHATSAPP_ORDERING",
  "PWA_MENU",
  "OFFLINE_MENU_CACHE",
  "CUSTOM_THEMES",
  "ADVANCED_THEMES",
  "CUSTOM_PAGES",
  "CUSTOM_COMPONENTS",
  "ADVANCED_ICONS",
  "MULTI_BRANCH",
  "QR_CODES",
  "CUSTOM_DOMAIN",
  "WHITE_LABEL",
  "ANALYTICS_BASIC",
  "ANALYTICS_ADVANCED",
  "SEO_BASIC",
  "SEO_ADVANCED",
  "MENU_VERSIONING",
  "DRAFT_PUBLISH",
  "PLUGIN_MARKETPLACE",
  "AI_TOOLS",
  "MAX_BRANCHES",
  "MAX_PRODUCTS",
  "MAX_MENUS"
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureDefinition = {
  key: FeatureKey;
  enabled: boolean;
  limit?: number | null;
};

export const PLAN_FEATURES: Record<string, FeatureDefinition[]> = {
  BASIC: [
    { key: "PRODUCT_IMAGES", enabled: true },
    { key: "CART_ORDERING", enabled: true },
    { key: "WHATSAPP_ORDERING", enabled: true },
    { key: "QR_CODES", enabled: true },
    { key: "SEO_BASIC", enabled: true },
    { key: "MAX_BRANCHES", enabled: true, limit: 1 },
    { key: "MAX_PRODUCTS", enabled: true, limit: 80 },
    { key: "MAX_MENUS", enabled: true, limit: 1 }
  ],
  PRO: [
    { key: "PRODUCT_IMAGES", enabled: true },
    { key: "CART_ORDERING", enabled: true },
    { key: "WHATSAPP_ORDERING", enabled: true },
    { key: "PWA_MENU", enabled: true },
    { key: "OFFLINE_MENU_CACHE", enabled: true },
    { key: "CUSTOM_THEMES", enabled: true },
    { key: "ADVANCED_THEMES", enabled: true },
    { key: "CUSTOM_PAGES", enabled: true },
    { key: "MULTI_BRANCH", enabled: true },
    { key: "PRODUCT_3D_VIEWER", enabled: true },
    { key: "ANALYTICS_BASIC", enabled: true },
    { key: "SEO_BASIC", enabled: true },
    { key: "QR_CODES", enabled: true },
    { key: "DRAFT_PUBLISH", enabled: true },
    { key: "MAX_BRANCHES", enabled: true, limit: 3 },
    { key: "MAX_PRODUCTS", enabled: true, limit: 300 },
    { key: "MAX_MENUS", enabled: true, limit: 5 }
  ],
  PREMIUM: [
    { key: "PRODUCT_IMAGES", enabled: true },
    { key: "CART_ORDERING", enabled: true },
    { key: "WHATSAPP_ORDERING", enabled: true },
    { key: "PWA_MENU", enabled: true },
    { key: "OFFLINE_MENU_CACHE", enabled: true },
    { key: "CUSTOM_THEMES", enabled: true },
    { key: "ADVANCED_THEMES", enabled: true },
    { key: "CUSTOM_PAGES", enabled: true },
    { key: "CUSTOM_COMPONENTS", enabled: true },
    { key: "ADVANCED_ICONS", enabled: true },
    { key: "MULTI_BRANCH", enabled: true },
    { key: "PRODUCT_3D_VIEWER", enabled: true },
    { key: "PRODUCT_VR_VIEWER", enabled: true },
    { key: "ANALYTICS_BASIC", enabled: true },
    { key: "ANALYTICS_ADVANCED", enabled: true },
    { key: "SEO_BASIC", enabled: true },
    { key: "SEO_ADVANCED", enabled: true },
    { key: "QR_CODES", enabled: true },
    { key: "CUSTOM_DOMAIN", enabled: true },
    { key: "WHITE_LABEL", enabled: true },
    { key: "MENU_VERSIONING", enabled: true },
    { key: "DRAFT_PUBLISH", enabled: true },
    { key: "PLUGIN_MARKETPLACE", enabled: true },
    { key: "MAX_BRANCHES", enabled: true, limit: 20 },
    { key: "MAX_PRODUCTS", enabled: true, limit: 2000 },
    { key: "MAX_MENUS", enabled: true, limit: 20 }
  ]
};
