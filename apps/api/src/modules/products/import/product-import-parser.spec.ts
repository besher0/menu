import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  parseBoolean,
  parseMoodSelection,
  parseProductImportWorkbook,
  PRODUCT_IMPORT_COLUMNS,
  splitNames
} from "./product-import-parser";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lpR24wAAAABJRU5ErkJggg==",
  "base64"
);

async function workbookBuffer(rows: unknown[][], images: Array<{ row: number; col?: number }> = []) {
  const workbook = new ExcelJS.Workbook();
  const products = workbook.addWorksheet("Products");
  products.addRow([...PRODUCT_IMPORT_COLUMNS]);
  rows.forEach((row) => products.addRow(row));

  const imageId = workbook.addImage({ buffer: tinyPng, extension: "png" });
  images.forEach((image) => {
    products.addImage(imageId, {
      tl: { col: image.col ?? 0, row: image.row - 1 },
      ext: { width: 32, height: 32 }
    });
  });

  const meta = workbook.addWorksheet("__meta");
  meta.state = "hidden";
  meta.addRow(["templateVersion", "1"]);
  meta.addRow(["mood", 1, "خفيف", "خفيف"]);
  meta.addRow(["mood", 2, "حار", "حار"]);
  meta.addRow(["mood", 3, "بارد", "بارد"]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function workbookBufferWithoutMeta(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const products = workbook.addWorksheet("Products");
  products.addRow([...PRODUCT_IMPORT_COLUMNS]);
  rows.forEach((row) => products.addRow(row));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("product import parser", () => {
  it("parses a product with one embedded image", async () => {
    const buffer = await workbookBuffer([
      ["", "عصير", "مشروبات", 0, "وصف", "true", "", "true,,true", "سكر, ثلج,سكر", "الحجم;السعرات"]
    ], [{ row: 2 }]);

    const parsed = await parseProductImportWorkbook(buffer);

    expect(parsed.globalErrors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].basePrice).toBe(0);
    expect(parsed.rows[0].isPopular).toBe(true);
    expect(parsed.rows[0].isNew).toBe(false);
    expect(parsed.rows[0].moodKeys).toEqual(["خفيف", "بارد"]);
    expect(parsed.rows[0].ingredientNames).toEqual(["سكر", "ثلج"]);
    expect(parsed.rows[0].mealDetailNames).toEqual(["الحجم", "السعرات"]);
    expect(parsed.rows[0].images).toHaveLength(1);
  });

  it("keeps multiple images in drawing order when they share a row", async () => {
    const buffer = await workbookBuffer([
      ["", "منتج", "قسم", 10, "", "", "", "", "", ""]
    ], [{ row: 2 }, { row: 2 }]);

    const parsed = await parseProductImportWorkbook(buffer);

    expect(parsed.totalImages).toBe(2);
    expect(parsed.rows[0].images.map((image) => image.order)).toEqual([0, 1]);
  });

  it("rejects empty names and negative prices", async () => {
    const buffer = await workbookBuffer([
      ["", "", "قسم", -1, "", "", "", "", "", ""]
    ]);

    const parsed = await parseProductImportWorkbook(buffer);

    expect(parsed.rows[0].errors).toContain("اسم الوجبة مطلوب");
    expect(parsed.rows[0].errors).toContain("السعر يجب أن يكون رقم 0 أو أكبر");
  });

  it("accepts only blank/true/false booleans", () => {
    expect(parseBoolean("", "جديدنا")).toMatchObject({ valid: true, value: false });
    expect(parseBoolean("TRUE", "جديدنا")).toMatchObject({ valid: true, value: true });
    expect(parseBoolean("false", "جديدنا")).toMatchObject({ valid: true, value: false });
    expect(parseBoolean("yes", "جديدنا")).toMatchObject({ valid: false });
  });

  it("parses positional mood selections and preserves blanks", () => {
    expect(parseMoodSelection("true,,true", ["a", "b", "c"])).toEqual({ keys: ["a", "c"], errors: [] });
    expect(parseMoodSelection("", ["a"])).toEqual({ keys: [], errors: [] });
  });

  it("parses mood selections by key or label", () => {
    expect(parseMoodSelection("hot, سريع, hot", [
      { key: "hot", label: "حار" },
      { key: "fast", label: "سريع" }
    ])).toEqual({ keys: ["hot", "fast"], errors: [] });
    expect(parseMoodSelection("غير موجود", [{ key: "hot", label: "حار" }]).errors).toContain("خيار المزاج \"غير موجود\" غير موجود");
  });

  it("uses fallback mood options when the workbook has no meta sheet", async () => {
    const buffer = await workbookBufferWithoutMeta([
      ["", "ظ…ظ†طھط¬", "ظ‚ط³ظ…", 10, "", "", "", "true,,true", "", ""]
    ]);

    const parsed = await parseProductImportWorkbook(buffer, ["ط®ظپظٹظپ", "ط­ط§ط±", "ط¨ط§ط±ط¯"]);

    expect(parsed.globalErrors).toEqual([]);
    expect(parsed.moodOptions).toEqual(["ط®ظپظٹظپ", "ط­ط§ط±", "ط¨ط§ط±ط¯"]);
    expect(parsed.rows[0].moodKeys).toEqual(["ط®ظپظٹظپ", "ط¨ط§ط±ط¯"]);
  });

  it("removes duplicate split names", () => {
    expect(splitNames("ملح, ملح، فلفل\nفلفل")).toEqual(["ملح", "فلفل"]);
  });

  it("throws a friendly error for corrupted xlsx files", async () => {
    await expect(parseProductImportWorkbook(Buffer.from("not an xlsx"))).rejects.toThrow("ملف Excel غير صالح أو تالف");
  });

  it("repairs namespaced simple xlsx files and accepts the first sheet", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="utf-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="utf-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml" Id="rId1"/>
      </Relationships>`);
    zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="utf-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1"/>
      </Relationships>`);
    zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="utf-8"?>
      <x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <x:sheets><x:sheet name="وجبات" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></x:sheets>
      </x:workbook>`);
    zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="utf-8"?>
      <x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <x:sheetData>
          <x:row r="1"><x:c r="A1" t="str"><x:v>الصورة</x:v></x:c><x:c r="B1" t="str"><x:v>اسم الوجبة</x:v></x:c><x:c r="C1" t="str"><x:v>القسم</x:v></x:c><x:c r="D1" t="str"><x:v>السعر</x:v></x:c><x:c r="E1" t="str"><x:v>الوصف</x:v></x:c></x:row>
          <x:row r="2"><x:c r="B2" t="str"><x:v>ميكس</x:v></x:c><x:c r="C2" t="str"><x:v>وجبات</x:v></x:c><x:c r="D2" t="n"><x:v>85</x:v></x:c><x:c r="E2" t="str"><x:v>وصف</x:v></x:c></x:row>
        </x:sheetData>
      </x:worksheet>`);

    const parsed = await parseProductImportWorkbook(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })));

    expect(parsed.globalErrors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ name: "ميكس", categoryName: "وجبات", basePrice: 85, errors: [] });
  });
});
