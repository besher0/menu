import { describe, it, expect, vi } from "vitest";
import { editorDraft, editorIsDirty, editorSaved, saveProductEditor, matchesSavedEditor, ProductEditorSaveError } from "./product-editor-save";
import type { ProductEditorAggregate, SaveProductEditor } from "@menu/shared";
const input = (): SaveProductEditor => ({
  create: true, expectedProductVersion: 0, expectedConfigurationVersion: 0,
  product: { name: "بيتزا", description: "Description", basePrice: "10", categoryId: "category",
    isNew: false, isFeatured: false, isPopular: true, moodKeys: [], images: [{ url: "/uploads/b.jpg", altText: "B" }, { url: "/uploads/a.jpg", altText: "A" }],
    ingredients: [], mealDetails: [] }
});
const result = (data = input()): ProductEditorAggregate => ({
  id: "stable-id", editVersion: data.expectedProductVersion + 1, configurationVersion: data.configuration?.revision ?? data.expectedConfigurationVersion,
  currency: "SYP", primaryImageId: null, product: data.product, configuration: data.configuration ?? null,
  dependencies: [], advancedMedia: { model3dUrl: "", model3dFormat: "GLB", vrUrl: "" }
});
const response = (value: unknown, status = 200) => new Response(JSON.stringify({ data: value }), { status });
describe("Unified product editor draft and one-save controller", () => {
  it("tracks dirty state including nested V2 edits", () => {
    const state = editorDraft({ name: "A", configuration: { groups: [{ label: "Before" }] } });
    expect(editorIsDirty(state)).toBe(false);
    const changed = { ...state, draft: { ...state.draft, configuration: { groups: [{ label: "After" }] } } };
    expect(editorIsDirty(changed)).toBe(true);
    expect(editorIsDirty(editorSaved(changed, changed.draft))).toBe(false);
  });
  it("preserves changes made while a save was pending", () => {
    const state = editorDraft({ name: "A" });
    const submitted = { name: "B" };
    const saved = editorSaved({ ...state, draft: { name: "C" }, pending: true }, submitted);
    expect(saved.draft.name).toBe("C"); expect(editorIsDirty(saved)).toBe(true); expect(saved.pending).toBe(false);
  });
  it("saves ordinary fields with exactly one PUT and stable identity", async () => {
    const transport = vi.fn().mockResolvedValue(response(result()));
    expect(await saveProductEditor(transport, "stable-id", input(), false)).toEqual(result());
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0]).toBe("/dashboard/products/stable-id/editor");
    expect(JSON.parse(transport.mock.calls[0][1].body).product.images[0].altText).toBe("B");
  });
  it("saves V2 draft through the same action, without a second configuration request", async () => {
    const data = input();
    data.configuration = { schemaVersion: 2, productId: "stable-id", revision: 1, basePrice: "10", groups: [] };
    const transport = vi.fn().mockResolvedValue(response(result(data)));
    const saved = await saveProductEditor(transport, "stable-id", data, false);
    expect(saved.configuration?.schemaVersion).toBe(2); expect(transport).toHaveBeenCalledOnce();
  });
  it("maps server validation paths and retains the submitted draft", async () => {
    const draft = input(), before = structuredClone(draft);
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ issues: [{ path: "product.images", message: "Unavailable" }] }), { status: 400 }));
    await expect(saveProductEditor(transport, "stable-id", draft, false)).rejects.toMatchObject({ status: 400, issues: [{ path: "product.images", message: "Unavailable" }] });
    expect(draft).toEqual(before);
  });
  it("surfaces 409 without retrying or overwriting a newer version", async () => {
    const update = { ...input(), create: false };
    const transport = vi.fn().mockResolvedValue(new Response("{}", { status: 409 }));
    await expect(saveProductEditor(transport, "stable-id", update, false)).rejects.toMatchObject({ status: 409 });
    expect(transport).toHaveBeenCalledOnce();
  });
  it("resolves a retry of the same stable create identity without a duplicate POST", async () => {
    const transport = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 409 })).mockResolvedValueOnce(response(result()));
    expect((await saveProductEditor(transport, "stable-id", input(), false)).editVersion).toBe(1);
    expect(transport.mock.calls.map(x => x[1].method ?? "GET")).toEqual(["PUT", "GET"]);
  });
  it("proves a committed save after a lost response using the aggregate contents and version", async () => {
    const transport = vi.fn().mockRejectedValueOnce(new TypeError("Lost response")).mockResolvedValueOnce(response(result()));
    expect((await saveProductEditor(transport, "stable-id", input(), false)).editVersion).toBe(1);
    expect(transport.mock.calls.map(x => x[1].method ?? "GET")).toEqual(["PUT", "GET"]);
  });
  it("recovers a truncated successful response by a trusted read", async () => {
    const transport = vi.fn().mockResolvedValueOnce(new Response("{")).mockResolvedValueOnce(response(result()));
    expect((await saveProductEditor(transport, "stable-id", input(), false)).id).toBe("stable-id");
  });
  it.each(["changed-content", "changed-version", "changed-identity", "unreachable"])("does not announce success after uncertain save: %s", async type => {
    const changed = structuredClone(result());
    if (type === "changed-content") changed.product.description = "Someone else";
    if (type === "changed-version") changed.editVersion++;
    if (type === "changed-identity") changed.id = "foreign";
    const transport = vi.fn().mockRejectedValueOnce(new Error("Timeout"));
    if (type === "unreachable") transport.mockRejectedValueOnce(new Error("Offline"));
    else transport.mockResolvedValueOnce(response(changed));
    await expect(saveProductEditor(transport, "stable-id", input(), false)).rejects.toBeInstanceOf(ProductEditorSaveError);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("blocks save while a required upload is pending or failed", async () => {
    const transport = vi.fn();
    await expect(saveProductEditor(transport, "stable-id", input(), true)).rejects.toMatchObject({ status: 0 });
    expect(transport).not.toHaveBeenCalled();
  });
  it("detects reordered images and config differences in recovery", () => {
    const saved = result(), data = input();
    saved.product.images.reverse();
    expect(matchesSavedEditor(saved, data)).toBe(false);
    expect(data.product.images[0].altText).toBe("B");
  });
  it("reopens the aggregate preserving the saved image and selection order", () => {
    const saved = result();
    const state = editorDraft(structuredClone(saved));
    expect(state.draft.product.images.map(x => x.altText)).toEqual(["B", "A"]);
    expect(editorIsDirty(state)).toBe(false);
  });
});
