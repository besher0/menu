import policy from "../../../public-image-policy.json";

// No generic server-side URL fetching. Unknown providers remain browser-direct.
export function safePublicImageSource(value: string | null | undefined): string {
  const src = value?.trim() ?? "";
  if (!src || /[\x00-\x1f\\]/.test(src)) return "";
  if (/^\/(?!\/)/.test(src)) return src;
  if (/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(src)) return src;
  try {
    const url = new URL(src);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? src : "";
  } catch { return ""; }
}

export function canOptimizePublicImage(src: string): boolean {
  if (src.startsWith("/")) {
    return policy.localPatterns.some(({ pathname, search }) => {
      if (search !== "" || !pathname.endsWith("/**")) return false;
      const prefix = pathname.slice(0, -2);
      return src.startsWith(prefix)
        && /^(?:[\w-]+\/)*[\w-]+(?:\.[\w-]+)*\.(?:jpe?g|png|webp)$/i.test(src.slice(prefix.length));
    });
  }
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
    // Keep vectors, animations and unknown formats unchanged (and out of Sharp).
    if (!/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return false;
    return policy.remotePatterns.some(pattern => pattern.hostname === url.hostname && (
      pattern.pathname === "/photos/**" ? /^\/photos\/\d+\/[\w.-]+$/.test(url.pathname)
        : /^\/[\w-]+\/image\/upload\/.+/.test(url.pathname)
    ));
  } catch { return false; }
}
