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
    "--icon-shadow": theme.icons?.shadow ?? "none"
  };
}
