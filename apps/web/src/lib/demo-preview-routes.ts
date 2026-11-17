import { hostnameFromHostHeader } from "./public-routes";

/** Only the protected Demo build may expose its one reviewed path-based menu. */
export function isDemoPreviewRoute(enabled: string | undefined, host: string | null, pathname: string) {
  if (enabled !== "1") return false;
  const hostname = hostnameFromHostHeader(host).toLowerCase();
  if (!["127.0.0.1", "localhost", "rydtest.ordersawa.com"].includes(hostname)) return false;
  return /^\/m\/preview-ordersawa(?:\/|$)/.test(pathname)
    || /^\/(?:login|dashboard|admin)(?:\/|$)/.test(pathname);
}
