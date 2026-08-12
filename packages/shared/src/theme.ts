export type IconDeviceSettings = {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  color?: string;
  backgroundColor?: string;
  borderRadius?: string;
  shadow?: string;
  visible?: boolean;
};

export type IconRenderConfig = IconDeviceSettings & {
  name: string;
  source?: "LIBRARY" | "UPLOADED_SVG" | "UPLOADED_PNG" | "ANIMATED";
  mobile?: IconDeviceSettings;
  tablet?: IconDeviceSettings;
  desktop?: IconDeviceSettings;
};

export const PUBLIC_TEMPLATE_KEYS = ["default", "vertigo"] as const;
export type PublicTemplateKey = (typeof PUBLIC_TEMPLATE_KEYS)[number];

export const HEADER_VARIANTS = ["default", "vertigo"] as const;
export type HeaderVariant = (typeof HEADER_VARIANTS)[number];

export const FOOTER_VARIANTS = ["default", "floating-pill"] as const;
export type FooterVariant = (typeof FOOTER_VARIANTS)[number];

export const PRODUCT_CARD_VARIANTS = [
  "wide-image",
  "featured-overlay-large",
  "horizontal-contained",
  "spotlight-contained"
] as const;
export type ProductCardVariant = (typeof PRODUCT_CARD_VARIANTS)[number];

export const CATEGORY_NAV_VARIANTS = ["image-chips", "text-tabs"] as const;
export type CategoryNavVariant = (typeof CATEGORY_NAV_VARIANTS)[number];

export type ThemeSettings = {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  typography: {
    fontFamily: string;
    headingFontFamily: string;
    baseFontSize: string;
  };
  radius: {
    button: string;
    card: string;
    section: string;
  };
  layout: {
    direction: "rtl" | "ltr";
    productCard: "compact" | "image-first" | "banner";
    categoryGrid: "chips" | "cards" | "banners";
    categoryProductListLayout?: "single" | "double";
  };
  icons?: {
    defaultSize?: number;
    color?: string;
    hoverColor?: string;
    backgroundColor?: string;
    borderRadius?: string;
    shadow?: string;
    animation?: string;
    instances?: IconRenderConfig[];
  };
  publicUi?: {
    template?: PublicTemplateKey;
    headerVariant?: HeaderVariant;
    footerVariant?: FooterVariant;
    productImagePlaceholderBackground?: string;
    moodChipLabelColor?: string;
    moodChipLabelFontSize?: string;
  };
};

export const ABO_MALEK_THEME: ThemeSettings = {
  colors: {
    primary: "#e51f2a",
    secondary: "#f59e0b",
    background: "#fff8f8",
    surface: "#ffffff",
    text: "#151515",
    muted: "#7b7b7b",
    border: "#f1e3e3",
    success: "#16a34a",
    warning: "#f59e0b",
    error: "#dc2626"
  },
  typography: {
    fontFamily: "Arial, Tahoma, sans-serif",
    headingFontFamily: "Arial, Tahoma, sans-serif",
    baseFontSize: "16px"
  },
  radius: {
    button: "14px",
    card: "18px",
    section: "22px"
  },
  layout: {
    direction: "rtl",
    productCard: "image-first",
    categoryGrid: "banners",
    categoryProductListLayout: "double"
  },
  icons: {
    defaultSize: 32,
    color: "#151515",
    hoverColor: "#e51f2a",
    backgroundColor: "#ffffff",
    borderRadius: "14px",
    shadow: "0 8px 20px rgb(16 24 40 / 10%)",
    instances: []
  },
  publicUi: {
    template: "default",
    headerVariant: "default",
    footerVariant: "default",
    productImagePlaceholderBackground: "#e5e7eb",
    moodChipLabelColor: "#ffffff",
    moodChipLabelFontSize: "16px"
  }
};

export const VERTIGO_THEME: ThemeSettings = {
  ...ABO_MALEK_THEME,
  colors: {
    ...ABO_MALEK_THEME.colors,
    primary: "#111111",
    secondary: "#111111",
    background: "#ffffff",
    surface: "#ffffff",
    text: "#111111",
    muted: "#9ca3af",
    border: "#eef0f4"
  },
  radius: {
    ...ABO_MALEK_THEME.radius,
    card: "28px",
    section: "28px"
  },
  layout: {
    direction: "rtl",
    productCard: "image-first",
    categoryGrid: "chips",
    categoryProductListLayout: "single"
  },
  icons: {
    ...ABO_MALEK_THEME.icons,
    color: "#111111",
    hoverColor: "#111111",
    backgroundColor: "#ffffff",
    borderRadius: "999px",
    shadow: "0 8px 22px rgb(16 24 40 / 8%)"
  },
  publicUi: {
    ...ABO_MALEK_THEME.publicUi,
    template: "vertigo",
    headerVariant: "vertigo",
    footerVariant: "floating-pill",
    productImagePlaceholderBackground: "#ffffff"
  }
};

export function themeToCssVariables(theme: ThemeSettings): Record<string, string> {
  return {
    "--color-primary": theme.colors.primary,
    "--color-secondary": theme.colors.secondary,
    "--color-background": theme.colors.background,
    "--color-surface": theme.colors.surface,
    "--color-text": theme.colors.text,
    "--color-muted": theme.colors.muted,
    "--color-border": theme.colors.border,
    "--color-success": theme.colors.success,
    "--color-warning": theme.colors.warning,
    "--color-error": theme.colors.error,
    "--font-base": theme.typography.fontFamily,
    "--font-heading": theme.typography.headingFontFamily,
    "--font-size-base": theme.typography.baseFontSize,
    "--radius-button": theme.radius.button,
    "--radius-card": theme.radius.card,
    "--radius-section": theme.radius.section,
    "--icon-color": theme.icons?.color ?? theme.colors.text,
    "--icon-hover-color": theme.icons?.hoverColor ?? theme.colors.primary,
    "--icon-background": theme.icons?.backgroundColor ?? theme.colors.surface,
    "--icon-radius": theme.icons?.borderRadius ?? theme.radius.button,
    "--icon-shadow": theme.icons?.shadow ?? "none",
    "--product-image-placeholder-bg": theme.publicUi?.productImagePlaceholderBackground ?? "#e5e7eb",
    "--mood-chip-label-color": theme.publicUi?.moodChipLabelColor ?? "#ffffff",
    "--mood-chip-label-font-size": theme.publicUi?.moodChipLabelFontSize ?? "16px"
  };
}
