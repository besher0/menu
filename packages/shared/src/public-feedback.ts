export type FeedbackMode = "DASHBOARD" | "WHATSAPP";
export function feedbackMode(value: unknown): FeedbackMode {
  return value === "WHATSAPP" ? "WHATSAPP" : "DASHBOARD";
}
export function feedbackRequiresComment(stars: number): boolean { return stars >= 1 && stars <= 3; }
export function validFeedbackStars(stars: number): boolean { return Number.isInteger(stars) && stars >= 1 && stars <= 5; }
/** Only explicit, finite WGS84 coordinates identify a precise location. No address geocoding. */
export function restaurantMapsUrl(latitude: unknown, longitude: unknown): string | null {
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

/** Explicit HTTPS Maps destinations only; never resolve redirects or fetch a user URL server-side. */
export function googleMapsShareUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const allowed = host === "maps.app.goo.gl" || host === "maps.google.com"
      || (["google.com", "www.google.com"].includes(host) && /^\/maps(?:\/|$)/.test(url.pathname))
      || (host === "goo.gl" && url.pathname.startsWith("/maps/"));
    return allowed ? url.href : null;
  } catch { return null; }
}
