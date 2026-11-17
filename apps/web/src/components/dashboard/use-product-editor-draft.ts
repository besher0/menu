"use client";
import { useCallback, useState, type SetStateAction } from "react";
import { editorDraft, editorIsDirty, editorSaved, type EditorDraftState } from "./product-editor-save";

/** Single draft for ordinary fields and future V62 configuration nodes. Selection is UI state only. */
export function useProductEditorDraft<T>(initial: () => T) {
  const [state, setState] = useState<EditorDraftState<T>>(() => editorDraft(initial()));
  const setDraft = useCallback((value: SetStateAction<T>) => setState(s => ({ ...s,
    draft: typeof value === "function" ? (value as (prev: T) => T)(s.draft) : value })), []);
  const hydrate = useCallback((draft: T) => setState(editorDraft(draft)), []);
  const saved = useCallback((submitted: T) => setState(s => editorSaved(s, submitted)), []);
  return { ...state, dirty: editorIsDirty(state), setDraft, hydrate, saved, setState };
}
