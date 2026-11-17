/** Draft-only presentation helpers. No persistence or pricing engine. */
export const MAX_PRODUCT_IMAGES = 5;
export type IngredientItem = { id?: string; libraryId?: string; adminName?: string; displayName?: string; name: string; imageUrl: string; isActive?: boolean };
export type DetailItem = { id?: string; libraryId?: string; adminName?: string; displayName?: string; label: string; value: string; icon: string;
  iconUrl?: string; valueType?: "VALUE" | "PRESENCE"; isActive?: boolean };
export const libraryIdentity = (item: { libraryId?: string; id?: string }) => item.libraryId ?? item.id;
export function availableLibrary<T extends { libraryId?: string; id?: string; isActive?: boolean }>(library: T[], selected: T[]) {
  const ids = new Set(selected.map(libraryIdentity).filter(Boolean));
  return library.filter(x => x.isActive !== false && !!libraryIdentity(x) && !ids.has(libraryIdentity(x)));
}
export function chooseIngredient(items: IngredientItem[], item: IngredientItem): IngredientItem[] {
  const id = libraryIdentity(item);
  return !id || items.some(x => libraryIdentity(x) === id) ? items : [...items, { ...item, libraryId: id }];
}
export function chooseDetail(items: DetailItem[], item: DetailItem): DetailItem[] {
  const id = libraryIdentity(item);
  // Library defaults describe the library, never this product's VALUE.
  return !id || items.some(x => libraryIdentity(x) === id) ? items : [...items, { ...item, libraryId: id, value: "" }];
}
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
  const next = [...items], [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}
export function appendImage(urls: string[], url: string): string[] {
  if (!url.trim()) throw new Error("لم يُعد الرفع رابط صورة صالحًا.");
  if (urls.includes(url)) return urls;
  if (urls.length >= MAX_PRODUCT_IMAGES) throw new Error("الحد الأقصى خمس صور. لم تُحذف أي صورة موجودة.");
  return [...urls, url];
}

/** The API has inspected the contents; a client filename never supplies the format. */
export function validatedModelUpload(asset: unknown): {model3dUrl: string; model3dFormat: "GLB" | "GLTF"} {
  if (!asset || typeof asset !== "object") throw new Error("لم يُعد الخادم ملف 3D موثقًا.");
  const value = asset as Record<string, unknown>;
  if (value.type !== "MODEL_3D" || (value.validatedFormat !== "GLB" && value.validatedFormat !== "GLTF")
    || typeof value.url !== "string" || !value.url.trim()) throw new Error("لم يُعد الخادم ملف 3D موثقًا. بقي الملف السابق محفوظًا.");
  return {model3dUrl:value.url, model3dFormat:value.validatedFormat};
}


type MoodPage = { isHome?: boolean; sections?: Array<{ type: string; isActive?: boolean; settings?: { moodItems?: Array<{ key?: string; label?: string }> } }> };
/** Use the same home-page selection as PublicHome; keys are identities, labels are presentation. */
export function productMoodOptions(pages: MoodPage[]) {
  const home = pages.find(p => p.isHome && p.sections?.some(s => s.type === "HERO" && s.isActive !== false))
    ?? pages.find(p => p.isHome) ?? pages[0];
  const items = home?.sections?.find(s => s.type === "MOOD_STRIP" && s.isActive !== false)?.settings?.moodItems ?? [];
  return items.filter(item => item.label?.trim()).map(item => ({ key: item.key?.trim() || item.label!.trim(), label: item.label!.trim() }));
}
