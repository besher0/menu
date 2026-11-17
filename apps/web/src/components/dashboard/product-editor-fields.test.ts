import { productMoodOptions } from "./product-editor-fields-model";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validatedModelUpload, appendImage, availableLibrary, chooseIngredient, chooseDetail, reorder } from "./product-editor-fields-model";
import { ProductEditorFields } from "./product-editor-fields";
import type { FormState } from "./product-form";
const ingredient = { libraryId: "cheese", name: "جبنة Mozzarella", imageUrl: "" };
const detail = { libraryId: "weight", label: "الوزن", value: "قيمة المكتبة", icon: "scale", valueType: "VALUE" as const };
describe("Product editor fields and library identities", () => {
  it("filters and deduplicates by libraryId rather than display names", () => {
    const other = { ...ingredient, libraryId: "other" };
    expect(chooseIngredient([ingredient], ingredient)).toEqual([ingredient]);
    expect(chooseIngredient([ingredient], other)).toHaveLength(2);
    expect(availableLibrary([ingredient, other], [ingredient])).toEqual([other]);
  });
  it("returns a removed identity to the picker and ignores inactive entries", () => {
    expect(availableLibrary([ingredient], [])).toEqual([ingredient]);
    expect(availableLibrary([{ ...ingredient, isActive: false }], [])).toEqual([]);
  });
  it("initializes local VALUE empty, never from a library default", () => {
    expect(chooseDetail([], detail)[0].value).toBe("");
    expect(detail.value).toBe("قيمة المكتبة");
  });
  it("deduplicates details independently of the mutable product value", () => {
    expect(chooseDetail([{ ...detail, value: "450 غ" }], detail)).toHaveLength(1);
  });
  it("keeps PRESENCE with no forced value", () => {
    expect(chooseDetail([], { ...detail, valueType: "PRESENCE" })[0]).toMatchObject({ valueType: "PRESENCE", value: "" });
  });
  it("makes a different image primary without losing the prior primary or stable metadata", () => {
    const rows = [{ id: "a", url: "1" }, { id: "b", url: "2" }, { id: "c", url: "3" }];
    expect(reorder(rows, 2, 0).map(x => x.id)).toEqual(["c", "a", "b"]);
    expect(rows.map(x => x.id)).toEqual(["a", "b", "c"]);
  });
  it("refuses additions beyond five while preserving an existing oversized gallery", () => {
    const old = ["1", "2", "3", "4", "5", "6"];
    expect(() => appendImage(old, "7")).toThrow(/خمس/);expect(old).toHaveLength(6);
    expect(reorder(old, 5, 0)).toHaveLength(6);
    expect(() => appendImage([], " ")).toThrow();expect(appendImage(["1"], "1")).toEqual(["1"]);
  });
  it("preserves the complete local card/value while reordering and rejects invalid drops", () => {
    const value = [{ ...detail, value: "450 غ" }, { ...detail, libraryId: "presence", valueType: "PRESENCE" as const }];
    expect(reorder(value, 0, 1)[1].value).toBe("450 غ"); expect(reorder(value, -1, 0)).toBe(value);
  });
  it("renders native V62 image/library fields, no currency selector or extra save", () => {
    const draft: FormState = { configuration: null, configurationMode: "LEGACY", name: "DEMO", categoryId: "", description: "", basePrice: "", currency: "SYP",
      imageUrl: "", imageUrls: [], imageReferences: [], moodKeys: ["محفوظ"], ingredients: [ingredient], mealDetails: [{ ...detail, value: "450 غ" }, { ...detail, libraryId: "p", label: "نباتي", value: "", valueType: "PRESENCE" }],
      model3dUrl: "", model3dFormat: "GLB", vrUrl: "", isNew: true, isPopular: false, isFeatured: true };
    const html = renderToStaticMarkup(React.createElement(ProductEditorFields, { draft, patch() {}, categories: [], moods: [], ingredients: [ingredient], details: [detail],
      ingredientStatus: "idle", detailStatus: "idle", disabled: false, sizesControlBase: false, uploading: false, baseReadOnly: true, uploadError: false, onUpload() {}, onDismissUploadError() {} }));
    expect(html).toContain("اختر القسم");expect(html).toContain("16:9");expect(html).toContain("450 غ");expect(html).toContain("صفة وجودية — بدون قيمة");
    expect(html).toContain("محفوظ (اختيار محفوظ)");expect(html).not.toContain("حفظ المنتج");expect(html).not.toContain("Administrative");
    expect(html).toMatch(/aria-label="السعر الأساسي Base"[^>]*disabled/);expect(html).not.toMatch(/<select[^>]*currency/i);expect(html).not.toContain("قيمة نباتي");
  });
});

it("accepts 3D format only from server-validated content metadata",()=>{
  for(const format of ["GLB","GLTF"]){
    expect(validatedModelUpload({url:"https://assets.example/model",type:"MODEL_3D",validatedFormat:format})).toEqual({model3dUrl:"https://assets.example/model",model3dFormat:format});
  }
  for(const asset of [null,{}, {url:"https://assets.example/model.glb",type:"MODEL_3D"},
    {url:"x",type:"IMAGE",validatedFormat:"GLB"},{url:"x",type:"MODEL_3D",validatedFormat:"USDZ"}]) expect(()=>validatedModelUpload(asset)).toThrow();
});


describe("Mood identity matches the public home without flag coupling", () => {
  it("uses the active home with HERO, not an unrelated page's Mood", () => {
    const result=productMoodOptions([
      {sections:[{type:"MOOD_STRIP",settings:{moodItems:[{label:"wrong"}]}}]},
      {isHome:true,sections:[{type:"HERO"},{type:"MOOD_STRIP",settings:{moodItems:[{key:"cheese-lovers",label:"عشاق الجبنة"},{label:"BBQ"},{label:" "}]}}]}
    ]);
    expect(result).toEqual([{key:"cheese-lovers",label:"عشاق الجبنة"},{key:"BBQ",label:"BBQ"}]);
  });
  it("does not invent options for empty or inactive sections", () => {
    expect(productMoodOptions([])).toEqual([]);
    expect(productMoodOptions([{isHome:true,sections:[{type:"MOOD_STRIP",isActive:false,settings:{moodItems:[{label:"hidden"}]}}]}])).toEqual([]);
  });
});
