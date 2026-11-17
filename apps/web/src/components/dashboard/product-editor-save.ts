import { productEditorFingerprint, normalizeMoney, type ProductEditorAggregate, type SaveProductEditor, type ProductEditorFields } from "@menu/shared";

export class ProductEditorSaveError extends Error {
  constructor(message: string, readonly status: number, readonly issues: Array<{ code?: string; path: string; message: string }> = []) { super(message); }
}
export type EditorTransport = (path: string, init?: RequestInit) => Promise<Response>;
const meaningful = (p: ProductEditorFields) => ({
  ...p,
  basePrice: p.basePrice === null ? null : normalizeMoney(p.basePrice),
  images: p.images.map(({ url, altText }) => ({ url, altText })),
  ingredients: p.ingredients.map(x => x.libraryId ? { libraryId: x.libraryId } : { name: x.name, imageUrl: x.imageUrl ?? "" }),
  mealDetails: p.mealDetails.map(x => x.libraryId ? { libraryId: x.libraryId, value: x.valueType === "PRESENCE" ? "" : x.value }
    : { label: x.label, value: x.value, icon: x.icon, iconUrl: x.iconUrl ?? "" })
});
export function matchesSavedEditor(result: ProductEditorAggregate, input: SaveProductEditor) {
  if (result.editVersion !== input.expectedProductVersion + 1 ||
    productEditorFingerprint(meaningful(result.product)) !== productEditorFingerprint(meaningful(input.product))) return false;
  if (input.advancedMedia && productEditorFingerprint(input.advancedMedia) !== productEditorFingerprint(result.advancedMedia)) return false;
  if (input.configuration) {
    const { revision: a, ...left } = input.configuration;
    const { revision: b, ...right } = result.configuration ?? { revision: 0 };
    return [input.expectedConfigurationVersion, input.expectedConfigurationVersion + 1].includes(result.configurationVersion)
      && productEditorFingerprint(left) === productEditorFingerprint(right);
  }
  return result.configurationVersion === input.expectedConfigurationVersion;
}
const body = async (response: Response) => {
  const parsed = await response.json();
  return parsed.data ?? parsed;
};
/** One PUT. A lost response is resolved only by matching a trusted aggregate and its version. */
export async function saveProductEditor(transport: EditorTransport, id: string, input: SaveProductEditor, uploadPending: boolean) {
  if (uploadPending) throw new ProductEditorSaveError("انتظر اكتمال رفع الملفات المطلوبة.", 0);
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    response = await transport("/dashboard/products/" + encodeURIComponent(id) + "/editor", {
      method: "PUT", body: JSON.stringify(input), headers: { "Content-Type": "application/json" }, signal: controller.signal
    });
    if (response.ok) {
      const saved = await body(response) as ProductEditorAggregate;
      if (saved?.id !== id || saved.editVersion !== input.expectedProductVersion + 1 ||
        !Number.isSafeInteger(saved.configurationVersion) || !saved.product || !saved.advancedMedia)
        throw new Error("Invalid aggregate response");
      return saved;
    }
  } catch {
    try {
      const read = await transport("/dashboard/products/" + encodeURIComponent(id) + "/editor", { cache: "no-store" });
      if (read.ok) {
        const saved = await body(read) as ProductEditorAggregate;
        if (saved.id === id && matchesSavedEditor(saved, input)) return saved;
      }
    } catch { /* Preserve the draft and identity; an unreachable read proves no outcome. */ }
    throw new ProductEditorSaveError("تعذر تأكيد الحفظ. احتُفظ بالمسودة والمعرّف؛ تحقق من الاتصال قبل إعادة المحاولة.", 0);
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    if (response.status === 409 && input.create) {
      try {
        const read = await transport("/dashboard/products/" + encodeURIComponent(id) + "/editor", { cache: "no-store" });
        const saved = read.ok ? await body(read) as ProductEditorAggregate : null;
        if (saved?.id === id && matchesSavedEditor(saved, input)) return saved;
      } catch { /* Conflict remains unresolved; never re-create with a different identity. */ }
    }
    const error = await body(response).catch(() => ({}));
    throw new ProductEditorSaveError(response.status === 409 ? "المنتج تغيّر في جلسة أخرى. احتُفظ بمسودتك؛ أعد فتح النسخة الحالية قبل الحفظ."
      : typeof error.message === "string" ? error.message : "تعذر حفظ المنتج.", response.status, error.issues ?? []);
  }
  throw new ProductEditorSaveError("تعذر تأكيد استجابة الحفظ.", 0);
}

export type EditorDraftState<T> = { draft: T; saved: T; pending: boolean; issues: Array<{ path: string; message: string }>; conflict: boolean };
export function editorDraft<T>(draft: T): EditorDraftState<T> {
  return { draft, saved: draft, pending: false, issues: [], conflict: false };
}
export function editorIsDirty<T>(state: EditorDraftState<T>) {
  return productEditorFingerprint(state.draft) !== productEditorFingerprint(state.saved);
}
export function editorSaved<T>(state: EditorDraftState<T>, submitted: T): EditorDraftState<T> {
  // Edits made while a request was pending remain dirty and are never replaced by a response.
  return { ...state, saved: submitted, pending: false, issues: [], conflict: false };
}
