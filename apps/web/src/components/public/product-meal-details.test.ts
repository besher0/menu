import { describe, expect, it } from "vitest";
import { productMealDetails } from "./product-meal-details";

const labels = { approximateWeight: "Weight", meatType: "Protein", breadType: "Bread", spiceLevel: "Spice" };
const read = (nutrition: unknown) => productMealDetails(nutrition, labels);
describe("customer meal details", () => {
  it.each([undefined, null, {}, { details: [] }, { details: [], protein: "old value" },
    { spice: "  " }, { details: [null, {}, { label: "Weight", value: " " }] }])("omits missing facts from %j", n => {
    expect(read(n)).toEqual([]);
  });
  it("shows only the recorded Legacy field and supports Arabic labels", () => {
    expect(read({ weight: "250 غ" })).toEqual([{ label: "Weight", value: "250 غ", icon: "scale" }]);
    expect(productMealDetails({ spice: " حار " }, { ...labels, spiceLevel: "مستوى الحدة" })).toEqual([
      { label: "مستوى الحدة", value: "حار", icon: "flame" }
    ]);
  });
  it("preserves recorded values, order, icons, and presence-only selections", () => {
    const details = [{ displayName: " مناسب للنباتيين ", valueType: "PRESENCE", icon: "heart", iconUrl: "/assets/leaf.png" },
      { label: "Weight", value: "0", icon: "scale" }, { label: "Bread", value: "Pita", icon: "wheat" }];
    const expected = [{ label: "مناسب للنباتيين", value: "", icon: "heart", iconUrl: "/assets/leaf.png" },
      { label: "Weight", value: "0", icon: "scale", iconUrl: "" }, { label: "Bread", value: "Pita", icon: "wheat", iconUrl: "" }];
    expect(read({ details, protein: "obsolete" })).toEqual(expected);
    expect(read(details)).toEqual(expected);
  });
  it("reflects edits and explicit deletion without recreating Legacy values", () => {
    expect(read({ details: [{ label: "Weight", value: "350 g" }] })[0].value).toBe("350 g");
    expect(read({ details: [], weight: "350 g" })).toEqual([]);
  });
});
