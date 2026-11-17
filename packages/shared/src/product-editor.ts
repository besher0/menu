import type { ProductConfigurationV2 } from "./product-configuration/v2-types";

/** Editor-owned fields only. Availability, currency and public orderability are server-owned. */
export type ProductEditorFields = {
  name: string;
  description: string;
  categoryId: string | null;
  basePrice: string | null;
  isNew: boolean;
  isFeatured: boolean;
  isPopular: boolean;
  moodKeys: string[];
  images: Array<{ id?: string; url: string; altText: string }>;
  ingredients: Array<{ libraryId?: string; name: string; displayName?: string; adminName?: string; imageUrl?: string }>;
  mealDetails: Array<{ libraryId?: string; label: string; displayName?: string; adminName?: string; value: string; icon: string; iconUrl?: string; valueType?: "VALUE" | "PRESENCE" }>;
};
export type ProductEditorMedia = { model3dUrl: string; model3dFormat: string; vrUrl: string };
export type SaveProductEditor = {
  create: boolean;
  expectedProductVersion: number;
  expectedConfigurationVersion: number;
  product: ProductEditorFields;
  /** Omission preserves the saved configuration. null is not a conversion command. */
  configuration?: ProductConfigurationV2;
  /** Explicit advanced-media change, restricted to SUPER_ADMIN. */
  advancedMedia?: ProductEditorMedia;
};
export type ProductEditorAggregate = {
  id: string;
  currency: string;
  editVersion: number;
  configurationVersion: number;
  primaryImageId: string | null;
  product: ProductEditorFields;
  configuration: ProductConfigurationV2 | null;
  dependencies: Array<{ sourceProductId: string; optionId: string; path: string; mode: "ORIGINAL" | "CUSTOM" }>;
  advancedMedia: ProductEditorMedia;
};

/** Stable object comparison, independent of JSON property order; array order remains semantic. */
export function productEditorFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(productEditorFingerprint).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${productEditorFingerprint((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
