/** Resolve stored local uploads against the public API base exactly once.
 * API_ORIGIN may include a reverse-proxy prefix (for example /api).
 * Upload responses already contain that prefix; Legacy /uploads paths do not.
 * This only builds a URL: it never fetches or modifies the stored asset.
 */
export function publicUploadUrl(value: string | null | undefined, apiOrigin: string): string | null {
  if (!value) return null;
  if (!value.includes("/uploads/")) return value;
  try {
    const base = new URL(apiOrigin);
    const prefix = base.pathname.replace(/\/$/, "");
    const asset = value.startsWith("/") && !value.startsWith("//")
      ? new URL(value, base.origin) : new URL(value);
    const uploadPath = asset.pathname.startsWith("/uploads/") ? asset.pathname
      : prefix && asset.pathname.startsWith(`${prefix}/uploads/`)
        ? asset.pathname.slice(prefix.length) : null;
    if (!uploadPath) return value;
    return `${base.origin}${prefix}${uploadPath}${asset.search}${asset.hash}`;
  } catch {
    return value;
  }
}
