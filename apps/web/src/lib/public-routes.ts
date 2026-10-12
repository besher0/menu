const DEFAULT_ROOT_DOMAIN = "ordersawa.com";
export const INTERNAL_RESTAURANT_REWRITE_HEADER = "x-ordersawa-internal-restaurant-rewrite";
export const INTERNAL_RESTAURANT_SLUG_HEADER = "x-ordersawa-internal-restaurant-slug";
const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "dashboard", "app"]);
const SUBDOMAIN_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function rootDomain() {
  return normalizeDomain(process.env.ROOT_DOMAIN ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN) ?? DEFAULT_ROOT_DOMAIN;
}

export function hostnameFromHostHeader(hostHeader?: string | null) {
  const host = hostHeader?.split(",")[0]?.trim() ?? "";

  if (!host) {
    return "";
  }

  if (host.startsWith("[")) {
    const endIndex = host.indexOf("]");
    return endIndex > 0 ? host.slice(1, endIndex) : host;
  }

  return host.split(":")[0]?.replace(/\.$/, "") ?? "";
}

export function isValidRestaurantSubdomain(value?: string | null) {
  if (!value || value !== value.toLowerCase()) {
    return false;
  }

  return SUBDOMAIN_SLUG_PATTERN.test(value) && !RESERVED_SUBDOMAINS.has(value);
}

export function restaurantSlugFromHost(hostHeader?: string | null, configuredRootDomain = rootDomain()) {
  const rawHostname = hostnameFromHostHeader(hostHeader);
  const hostname = rawHostname.toLowerCase();
  const domain = normalizeDomain(configuredRootDomain);

  if (!hostname || !domain || isLocalHostname(hostname)) {
    return null;
  }

  if (hostname === domain || hostname === `www.${domain}` || !hostname.endsWith(`.${domain}`)) {
    return null;
  }

  const subdomain = rawHostname.slice(0, -(domain.length + 1)).split(".")[0] ?? "";
  return isValidRestaurantSubdomain(subdomain) ? subdomain : null;
}

export function isRestaurantSubdomainHost(hostHeader: string | null | undefined, restaurantSlug: string) {
  return restaurantSlugFromHost(hostHeader) === restaurantSlug;
}

export function restaurantPath(restaurantSlug: string, pathname = "", useSubdomainRoutes = true) {
  const path = normalizePublicPath(pathname);
  return useSubdomainRoutes ? path : `/m/${restaurantSlug}${path === "/" ? "" : path}`;
}

export function preferredRestaurantUrl(restaurantSlug: string, pathname = "") {
  return `https://${restaurantSlug}.${rootDomain()}${normalizePublicPath(pathname) === "/" ? "" : normalizePublicPath(pathname)}`;
}

export function legacyRestaurantPath(restaurantSlug: string, pathname = "") {
  return restaurantPath(restaurantSlug, pathname, false);
}

function normalizeDomain(value?: string | null) {
  const domain = value
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    ?.split(":")[0]
    ?.replace(/\.$/, "")
    .toLowerCase();

  return domain || null;
}

function normalizePublicPath(pathname: string) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}
