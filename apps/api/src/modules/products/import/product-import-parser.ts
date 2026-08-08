import ExcelJS from "exceljs";
import JSZip from "jszip";

export const PRODUCT_IMPORT_COLUMNS = [
  "الصور",
  "اسم الوجبة",
  "القسم",
  "السعر",
  "الوصف",
  "الأكثر طلباً",
  "جديدنا",
  "شو مزاجك اليوم",
  "المكونات",
  "تفاصيل الوجبة"
] as const;

export const PRODUCT_IMPORT_LIMITS = {
  maxFileBytes: Number(process.env.PRODUCT_IMPORT_MAX_FILE_MB ?? 20) * 1024 * 1024,
  maxRows: Number(process.env.PRODUCT_IMPORT_MAX_ROWS ?? 500),
  maxImagesPerProduct: Number(process.env.PRODUCT_IMPORT_MAX_IMAGES_PER_PRODUCT ?? 8),
  maxImageBytes: Number(process.env.PRODUCT_IMPORT_MAX_IMAGE_MB ?? 8) * 1024 * 1024,
  maxTotalImages: Number(process.env.PRODUCT_IMPORT_MAX_TOTAL_IMAGES ?? 1000)
};

export type ProductImportParsedImage = {
  rowNumber: number;
  extension: string;
  mimeType: string;
  buffer: Buffer;
  size: number;
  order: number;
  left: number;
  top: number;
};

export type ProductImportParsedRow = {
  rowNumber: number;
  name: string;
  categoryName: string;
  basePrice: number | null;
  description: string;
  isPopular: boolean;
  isNew: boolean;
  moodKeys: string[];
  ingredientNames: string[];
  mealDetailNames: string[];
  images: ProductImportParsedImage[];
  errors: string[];
};

export type ProductImportParseResult = {
  globalErrors: string[];
  rows: ProductImportParsedRow[];
  moodOptions: string[];
  totalImages: number;
};

export type ProductImportMoodOption = string | { key: string; label?: string };

type NormalizedMoodOption = {
  key: string;
  label: string;
};

export async function parseProductImportWorkbook(buffer: Buffer, fallbackMoodOptions: ProductImportMoodOption[] = []): Promise<ProductImportParseResult> {
  const globalErrors: string[] = [];
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    const repaired = await repairNamespacedXlsx(buffer);
    if (!repaired) {
      throw new Error("ملف Excel غير صالح أو تالف");
    }

    try {
      await workbook.xlsx.load(repaired as any);
    } catch {
      throw new Error("ملف Excel غير صالح أو تالف");
    }
  }

  const worksheet = workbook.getWorksheet("Products") ?? workbook.worksheets.find((sheet) => sheet.name !== "__meta");
  if (!worksheet) {
    return { globalErrors: ["لا يوجد sheet قابل للاستيراد داخل ملف Excel"], rows: [], moodOptions: [], totalImages: 0 };
  }

  const workbookMoodOptions = readMoodOptions(workbook);
  const fallbackMoodOptionRecords = normalizeMoodOptions(fallbackMoodOptions);
  const moodOptionRecords = workbookMoodOptions.length ? workbookMoodOptions : fallbackMoodOptionRecords;
  const moodOptions = moodOptionRecords.map((item) => item.key);
  if (workbook.getWorksheet("__meta") && !workbookMoodOptions.length) {
    globalErrors.push("بيانات المزاج داخل النموذج غير موجودة. حمّل النموذج من الداشبورد واستخدمه للاستيراد.");
  }

  const headerErrors = validateHeaders(worksheet);
  globalErrors.push(...headerErrors);

  const imagesByRow = mapWorksheetImages(workbook, worksheet);
  const totalImages = Array.from(imagesByRow.values()).reduce((sum, images) => sum + images.length, 0);
  if (totalImages > PRODUCT_IMPORT_LIMITS.maxTotalImages) {
    globalErrors.push(`عدد الصور داخل الملف أكبر من الحد المسموح (${PRODUCT_IMPORT_LIMITS.maxTotalImages}).`);
  }

  const rows: ProductImportParsedRow[] = [];
  const lastRow = Math.max(worksheet.actualRowCount, worksheet.rowCount);

  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (isEmptyProductRow(row) && !(imagesByRow.get(rowNumber)?.length)) {
      continue;
    }

    if (rows.length >= PRODUCT_IMPORT_LIMITS.maxRows) {
      globalErrors.push(`عدد الصفوف أكبر من الحد المسموح (${PRODUCT_IMPORT_LIMITS.maxRows}).`);
      break;
    }

    const errors: string[] = [];
    const name = cellText(row.getCell(2));
    const categoryName = cellText(row.getCell(3));
    const price = parsePrice(cellText(row.getCell(4)));
    const popular = parseBoolean(cellText(row.getCell(6)), "الأكثر طلباً");
    const isNew = parseBoolean(cellText(row.getCell(7)), "جديدنا");
    const mood = parseMoodSelection(cellText(row.getCell(8)), moodOptionRecords);
    const images = imagesByRow.get(rowNumber) ?? [];

    if (!name) errors.push("اسم الوجبة مطلوب");
    if (!categoryName) errors.push("القسم مطلوب");
    if (!price.valid) errors.push(price.error);
    if (!popular.valid) errors.push(popular.error);
    if (!isNew.valid) errors.push(isNew.error);
    errors.push(...mood.errors);
    errors.push(...validateImages(images));

    rows.push({
      rowNumber,
      name,
      categoryName,
      basePrice: price.value,
      description: cellText(row.getCell(5)),
      isPopular: popular.value,
      isNew: isNew.value,
      moodKeys: mood.keys,
      ingredientNames: splitNames(cellText(row.getCell(9))),
      mealDetailNames: splitNames(cellText(row.getCell(10))),
      images,
      errors
    });
  }

  return { globalErrors, rows, moodOptions, totalImages };
}

export function parseBoolean(value: string, label = "القيمة") {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return { valid: true, value: false, error: "" };
  if (["true", "yes", "y", "1", "نعم", "صح"].includes(normalized)) return { valid: true, value: true, error: "" };
  if (["false", "no", "n", "0", "لا", "غلط", "خطأ", "خطا"].includes(normalized)) return { valid: true, value: false, error: "" };
  return { valid: false, value: false, error: `${label} تقبل true أو false أو نعم/لا أو فراغ فقط` };
}

export function parseMoodSelection(value: string, moodOptions: ProductImportMoodOption[]) {
  const trimmed = value.trim();
  if (!trimmed) return { keys: [] as string[], errors: [] as string[] };

  const tokens = value.split(/[,،]/g);
  const errors: string[] = [];
  const keys: string[] = [];
  const normalizedOptions = normalizeMoodOptions(moodOptions);
  const positionalMode = tokens.every((token) => isBooleanToken(token));

  if (positionalMode) {
    tokens.forEach((token, index) => {
      const parsed = parseBoolean(token, `شو مزاجك اليوم - الخيار ${index + 1}`);
      if (!parsed.valid) {
        errors.push(parsed.error);
        return;
      }

      if (parsed.value) {
        const moodKey = normalizedOptions[index]?.key;
        if (moodKey) {
          keys.push(moodKey);
        } else {
          errors.push(`لا يوجد خيار مزاج بالترتيب ${index + 1}`);
        }
      }
    });

    return { keys: uniqueStrings(keys), errors };
  }

  const byName = new Map<string, string>();
  normalizedOptions.forEach((option) => {
    byName.set(normalizeLookupValue(option.key), option.key);
    byName.set(normalizeLookupValue(option.label), option.key);
  });

  splitNames(value).forEach((name) => {
    const moodKey = byName.get(normalizeLookupValue(name));
    if (moodKey) {
      keys.push(moodKey);
    } else {
      errors.push(`خيار المزاج "${name}" غير موجود`);
    }
  });

  return { keys: uniqueStrings(keys), errors };
}

export function splitNames(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[\n;,،]+/g)
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeMoodOptions(options: ProductImportMoodOption[]): NormalizedMoodOption[] {
  return options
    .map((option) => {
      if (typeof option === "string") {
        const key = option.trim();
        return key ? { key, label: key } : null;
      }

      const key = option.key.trim();
      const label = option.label?.trim() || key;
      return key ? { key, label } : null;
    })
    .filter((option): option is NormalizedMoodOption => Boolean(option));
}

function isBooleanToken(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return !normalized || ["true", "yes", "y", "1", "نعم", "صح", "false", "no", "n", "0", "لا", "غلط", "خطأ", "خطا"].includes(normalized);
}

function normalizeLookupValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeLookupValue(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function repairNamespacedXlsx(buffer: Buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const xmlFiles = Object.keys(zip.files).filter((name) => name.endsWith(".xml") || name.endsWith(".rels"));
    let changed = false;

    for (const name of xmlFiles) {
      const file = zip.file(name);
      if (!file) continue;

      const current = await file.async("string");
      const next = current
        .replace(/^\uFEFF/, "")
        .replace(/<([/]?)([A-Za-z_][\w.-]*):/g, "<$1")
        .replace(/\sxmlns:([A-Za-z_][\w.-]*)=/g, " xmlns:$1=");

      if (next !== current) {
        zip.file(name, next);
        changed = true;
      }
    }

    return changed ? Buffer.from(await zip.generateAsync({ type: "nodebuffer" })) : null;
  } catch {
    return null;
  }
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[؟?]/g, "")
    .toLocaleLowerCase();
}

function validateHeaders(worksheet: ExcelJS.Worksheet) {
  const firstRow = worksheet.getRow(1);
  const errors: string[] = [];
  const expected = PRODUCT_IMPORT_COLUMNS;
  const imageHeader = normalizeHeader(cellText(firstRow.getCell(1)));
  const nameHeader = normalizeHeader(cellText(firstRow.getCell(2)));
  const categoryHeader = normalizeHeader(cellText(firstRow.getCell(3)));
  const priceHeader = normalizeHeader(cellText(firstRow.getCell(4)));

  if (imageHeader && imageHeader !== normalizeHeader(expected[0]) && imageHeader !== normalizeHeader("الصورة")) {
    errors.push(`العمود 1 يجب أن يكون "${expected[0]}" أو "الصورة"`);
  }

  if (nameHeader !== normalizeHeader(expected[1])) {
    errors.push(`العمود 2 يجب أن يكون "${expected[1]}"`);
  }

  if (categoryHeader !== normalizeHeader(expected[2])) {
    errors.push(`العمود 3 يجب أن يكون "${expected[2]}"`);
  }

  if (priceHeader !== normalizeHeader(expected[3])) {
    errors.push(`العمود 4 يجب أن يكون "${expected[3]}"`);
  }

  for (let index = 5; index <= expected.length; index += 1) {
    const actual = normalizeHeader(cellText(firstRow.getCell(index)));
    if (actual && actual !== normalizeHeader(expected[index - 1])) {
      errors.push(`العمود ${index} يجب أن يكون "${expected[index - 1]}" أو اتركه فارغاً`);
    }
  }

  return errors;
}

function readMoodOptions(workbook: ExcelJS.Workbook): NormalizedMoodOption[] {
  const meta = workbook.getWorksheet("__meta");
  if (!meta) return [];

  const moods: Array<{ index: number; key: string; label: string }> = [];
  meta.eachRow((row) => {
    const type = cellText(row.getCell(1));
    if (type !== "mood") return;

    const index = Number(cellText(row.getCell(2)));
    const key = cellText(row.getCell(3)) || cellText(row.getCell(4));
    const label = cellText(row.getCell(4)) || key;
    if (Number.isInteger(index) && index > 0 && key) {
      moods.push({ index, key, label });
    }
  });

  return moods.sort((left, right) => left.index - right.index).map((item) => ({ key: item.key, label: item.label }));
}

function mapWorksheetImages(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet) {
  const byRow = new Map<number, ProductImportParsedImage[]>();
  const worksheetWithImages = worksheet as ExcelJS.Worksheet & {
    getImages?: () => Array<{ imageId: number; range: any }>;
  };
  const images = worksheetWithImages.getImages?.() ?? [];

  images.forEach((image, drawingOrder) => {
    const topLeft = image.range?.tl ?? {};
    const nativeCol = Number(topLeft.nativeCol ?? topLeft.col ?? 0);
    const nativeRow = Number(topLeft.nativeRow ?? topLeft.row ?? 0);
    const rowNumber = Math.floor(nativeRow) + 1;
    const columnNumber = Math.floor(nativeCol) + 1;
    if (columnNumber !== 1 || rowNumber < 2) return;

    const workbookImage = workbook.getImage(Number(image.imageId)) as {
      extension?: string;
      buffer?: Buffer;
    } | undefined;
    if (!workbookImage?.buffer) return;

    const extension = (workbookImage.extension ?? "png").toLocaleLowerCase();
    const parsedImage: ProductImportParsedImage = {
      rowNumber,
      extension,
      mimeType: mimeFromExtension(extension),
      buffer: Buffer.from(workbookImage.buffer),
      size: workbookImage.buffer.length,
      order: drawingOrder,
      left: nativeCol,
      top: nativeRow
    };
    const current = byRow.get(rowNumber) ?? [];
    current.push(parsedImage);
    byRow.set(rowNumber, current);
  });

  for (const [rowNumber, rowImages] of byRow) {
    byRow.set(
      rowNumber,
      rowImages.sort((left, right) => left.left - right.left || left.top - right.top || left.order - right.order)
    );
  }

  return byRow;
}

function validateImages(images: ProductImportParsedImage[]) {
  const errors: string[] = [];
  if (images.length > PRODUCT_IMPORT_LIMITS.maxImagesPerProduct) {
    errors.push(`عدد صور المنتج أكبر من الحد المسموح (${PRODUCT_IMPORT_LIMITS.maxImagesPerProduct}).`);
  }

  images.forEach((image, index) => {
    const extension = `.${image.extension.replace(/^\./, "")}`.toLocaleLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      errors.push(`الصورة ${index + 1} بصيغة غير مدعومة. الصيغ المسموحة jpg/jpeg/png/webp.`);
    }

    if (image.size > PRODUCT_IMPORT_LIMITS.maxImageBytes) {
      errors.push(`الصورة ${index + 1} أكبر من الحد المسموح (${Math.round(PRODUCT_IMPORT_LIMITS.maxImageBytes / 1024 / 1024)}MB).`);
    }
  });

  return errors;
}

function parsePrice(value: string) {
  if (!value.trim()) return { valid: false, value: null, error: "السعر مطلوب" };

  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { valid: false, value: null, error: "السعر يجب أن يكون رقم 0 أو أكبر" };
  }

  return { valid: true, value: parsed, error: "" };
}

function isEmptyProductRow(row: ExcelJS.Row) {
  for (let index = 2; index <= PRODUCT_IMPORT_COLUMNS.length; index += 1) {
    if (cellText(row.getCell(index))) return false;
  }
  return true;
}

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result !== undefined) return String(value.result).trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((item: { text?: string }) => item.text ?? "").join("").trim();
    }
  }

  return String(value).trim();
}

function mimeFromExtension(extension: string) {
  const normalized = extension.replace(/^\./, "").toLocaleLowerCase();
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  return "image/jpeg";
}
