import { headers } from "next/headers";

/** Server-side gate for the isolated Stage 6D.2B page; the API independently verifies the actual DB. */
export async function networkOrderTestPageEnabled(): Promise<boolean> {
  const host = (await headers()).get("host") ?? "";
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
  return isNetworkOrderTestHostAllowed(process.env.NODE_ENV, process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS, host, api);
}

export function isNetworkOrderTestHostAllowed(nodeEnv: string | undefined, flag: string | undefined, host: string, api: string): boolean {
  if (nodeEnv === "production" || flag !== "1") return false;
  try {
    const browserHost = new URL(`http://${host}`).hostname;
    const apiUrl = new URL(api);
    return ["localhost", "127.0.0.1"].includes(browserHost)
      && ["localhost", "127.0.0.1"].includes(apiUrl.hostname)
      && apiUrl.protocol === "http:" && apiUrl.port === "5000";
  } catch {
    return false;
  }
}
