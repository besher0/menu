import type { ProductConfigurationV1 } from "@menu/shared";
import { API_URL } from "@/lib/client-api";
import { authHeaders } from "@/lib/session";
import {
  ProductCandidate,
  ProductConfigurationApiError,
  ProductConfigurationEnvelope
} from "./types";

type ApiPayload<T> = {
  data?: T;
  message?: string | string[];
  error?: string;
  issues?: Array<{ code: string; path: string; message: string }>;
  details?: unknown;
};

function unwrap<T>(payload: ApiPayload<T> | T): T {
  return payload && typeof payload === "object" && "data" in payload && (payload as ApiPayload<T>).data !== undefined
    ? (payload as ApiPayload<T>).data as T
    : payload as T;
}

function messageFromPayload(payload: ApiPayload<unknown> | null, fallback: string) {
  if (Array.isArray(payload?.message)) return payload.message.join("، ");
  return payload?.message || fallback;
}

async function configurationFetch<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...init.headers
    },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null) as ApiPayload<T> | T | null;
  if (!response.ok) {
    const body = payload as ApiPayload<unknown> | null;
    throw new ProductConfigurationApiError(
      messageFromPayload(body, `تعذر تنفيذ الطلب (HTTP ${response.status}).`),
      response.status,
      typeof body?.error === "string" ? body.error : undefined,
      Array.isArray(body?.issues) ? body.issues : [],
      body?.details
    );
  }
  if (payload === null) throw new ProductConfigurationApiError("استجابة الخادم فارغة.", response.status);
  return unwrap(payload);
}

export function loadProductConfiguration(productId: string) {
  return configurationFetch<ProductConfigurationEnvelope>(`/dashboard/products/${productId}/configuration`);
}

export function saveProductConfiguration(
  productId: string,
  expectedVersion: number,
  configuration: ProductConfigurationV1
) {
  return configurationFetch<ProductConfigurationEnvelope>(`/dashboard/products/${productId}/configuration`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion, configuration })
  });
}

export async function searchRestaurantProducts(search = "") {
  const params = new URLSearchParams({ page: "1", limit: "100", sort: "sortOrder" });
  if (search.trim()) params.set("search", search.trim());
  const result = await configurationFetch<{ data: ProductCandidate[] }>(`/dashboard/products?${params.toString()}`);
  return Array.isArray(result) ? result as unknown as ProductCandidate[] : result.data;
}
