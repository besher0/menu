"use client";

import { adminAuthHeaders, authHeaders } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type ApiResponse<T> = {
  data: T;
  message?: string;
};

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(path.startsWith("/admin") ? adminAuthHeaders() : authHeaders()),
      ...init.headers
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `API request failed: ${path}`);
  }

  return payload?.data as T;
}
