import { BadRequestException, Inject, Injectable, StreamableFile } from "@nestjs/common";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { readFile } from "fs/promises";
import { basename, extname, resolve } from "path";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { MediaStorageService, StoredUpload } from "../media/media-storage.service";
import { ProductLibraryService } from "../media/product-library.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  parseProductImportWorkbook,
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_LIMITS,
  ProductImportMoodOption,
  ProductImportParsedImage,
  ProductImportParsedRow
} from "./import/product-import-parser";
import { ProductsService } from "./products.service";

type ImportContext = {
  restaurant: { id: string; currency: string };
  categories: Map<string, Array<{ id: string; name: string }>>;
  ingredients: Map<string, ReturnType<ProductLibraryService["ingredientSnapshot"]>>;
  mealDetails: Map<string, ReturnType<ProductLibraryService["mealDetailSnapshot"]>>;
  moodOptions: Array<{ key: string; label: string }>;
  currentProductCount: number;
  productLimit: number | null;
  nextSortOrder: number;
};

type ValidatedImportRow = ProductImportParsedRow & {
  categoryId: string | null;
  resolvedIngredients: ReturnType<ProductLibraryService["ingredientSnapshot"]>[];
  resolvedMealDetails: ReturnType<ProductLibraryService["mealDetailSnapshot"]>[];
  isValid: boolean;
};

type ExportableWorkbookImage = {
  buffer: Buffer;
  extension: "jpeg" | "png";
};

@Injectable()
export class ProductsImportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService,
    @Inject(ProductLibraryService) private readonly productLibrary: ProductLibraryService,
    @Inject(MediaStorageService) private readonly storage: MediaStorageService,
    @Inject(ProductsService) private readonly productsService: ProductsService
  ) {}

  async template(restaurantId: string) {
    const context = await this.loadContext(restaurantId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Menu Dashboard";
    workbook.created = new Date();

    const products = workbook.addWorksheet("Products", { views: [{ rightToLeft: true }] });
    products.addRow([...PRODUCT_IMPORT_COLUMNS]);
    products.columns = [
      { width: 18 },
      { width: 28 },
      { width: 24 },
      { width: 14 },
      { width: 40 },
      { width: 16 },
      { width: 14 },
      { width: Math.max(22, context.moodOptions.length * 7) },
      { width: 36 },
      { width: 36 }
    ];
    products.getRow(1).font = { bold: true };
    const moodLabels = context.moodOptions.map((item) => item.label).join("، ");
    const moodPrompt = moodLabels
      ? `اكتب true,,true حسب الترتيب، أو اكتب أسماء الخيارات مفصولة بفواصل: ${moodLabels}`
      : "لا يوجد خيارات مزاج فعالة لهذا المطعم.";
    products.getCell("H2").note = moodPrompt;
    products.getCell("F2").note = "اكتب true أو false أو اتركها فارغة.";
    products.getCell("G2").note = "اكتب true أو false أو اتركها فارغة.";
    for (let rowNumber = 2; rowNumber <= 501; rowNumber += 1) {
      products.getCell(`H${rowNumber}`).dataValidation = {
        type: "textLength",
        operator: "greaterThanOrEqual",
        formulae: [0],
        showInputMessage: true,
        promptTitle: "شو مزاجك اليوم",
        prompt: moodPrompt.slice(0, 255)
      };
    }

    const instructions = workbook.addWorksheet("Instructions", { views: [{ rightToLeft: true }] });
    instructions.addRows([
      ["طريقة الاستخدام"],
      ["1. املأ Sheet Products فقط، ولا تضف restaurantId."],
      ["2. ضع صور المنتج كصور embedded داخل الخلية/منطقة العمود A في نفس صف المنتج."],
      ["3. أسماء الأقسام والمكونات وتفاصيل الوجبة يجب أن تطابق اسم الإدارة."],
      ["4. قيم true/false يجب كتابتها بالإنكليزي، والفراغ يعني false."],
      ["5. شو مزاجك اليوم يقبل true,,true حسب الترتيب، أو أسماء الخيارات مباشرة مفصولة بفواصل."],
      ["خيارات شو مزاجك اليوم المتاحة", moodLabels || "لا يوجد خيارات حالياً"],
      [],
      ["الأقسام المتاحة"],
      ...Array.from(context.categories.values()).flat().map((category) => [category.name]),
      [],
      ["مكتبة المكونات - اسم الإدارة"],
      ...Array.from(context.ingredients.values()).map((item) => [item.adminName, `يظهر للزبون: ${item.displayName}`]),
      [],
      ["تفاصيل الوجبة - اسم الإدارة"],
      ...Array.from(context.mealDetails.values()).map((item) => [item.adminName, `يظهر للزبون: ${item.displayName}`, item.value]),
      [],
      ["ترتيب شو مزاجك اليوم"],
      ...context.moodOptions.map((item, index) => [`${index + 1}`, item.key, item.label])
    ]);
    instructions.columns = [{ width: 32 }, { width: 36 }, { width: 24 }];

    const mood = workbook.addWorksheet("Mood Options", { views: [{ rightToLeft: true }] });
    mood.addRow(["الترتيب", "اسم الإدارة / المفتاح", "الاسم الظاهر"]);
    context.moodOptions.forEach((item, index) => {
      mood.addRow([index + 1, item.key, item.label]);
    });
    mood.columns = [{ width: 14 }, { width: 32 }, { width: 32 }];
    mood.getRow(1).font = { bold: true };

    const meta = workbook.addWorksheet("__meta");
    meta.state = "hidden";
    meta.addRow(["templateVersion", "1"]);
    context.moodOptions.forEach((item, index) => {
      meta.addRow(["mood", index + 1, item.key, item.label]);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      __raw: true,
      value: new StreamableFile(Buffer.from(buffer), {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: `attachment; filename="products-import-template.xlsx"`
      })
    };
  }

  async exportProducts(restaurantId: string) {
    const context = await this.loadContext(restaurantId);
    const exportedProducts = await this.prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      select: {
        name: true,
        description: true,
        basePrice: true,
        isPopular: true,
        isNew: true,
        moodKey: true,
        ingredients: true,
        nutrition: true,
        images: {
          where: { isActive: true },
          select: { url: true },
          orderBy: { sortOrder: "asc" }
        },
        category: { select: { name: true } }
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "desc" }]
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Menu Dashboard";
    workbook.created = new Date();

    const products = workbook.addWorksheet("Products", { views: [{ rightToLeft: true }] });
    products.addRow([...PRODUCT_IMPORT_COLUMNS]);
    products.columns = [
      { width: 18 },
      { width: 28 },
      { width: 24 },
      { width: 14 },
      { width: 40 },
      { width: 16 },
      { width: 14 },
      { width: Math.max(22, context.moodOptions.length * 7) },
      { width: 36 },
      { width: 36 }
    ];
    products.getRow(1).font = { bold: true };

    for (const product of exportedProducts) {
      const row = products.addRow([
        "",
        product.name,
        product.category?.name ?? "",
        Number(product.basePrice),
        product.description ?? "",
        product.isPopular ? "true" : "false",
        product.isNew ? "true" : "false",
        this.parseStoredMoodKeys(product.moodKey).join(", "),
        this.exportLibraryNames(product.ingredients, ["adminName", "displayName", "name"]).join(", "),
        this.exportMealDetailNames(product.nutrition).join(", ")
      ]);
      const images = await this.loadExportImages(product.images.map((image) => image.url));
      if (images.length) {
        row.height = 42;
        images.forEach((image, imageIndex) => {
          const imageId = workbook.addImage({ buffer: image.buffer as any, extension: image.extension });
          products.addImage(imageId, {
            tl: { col: imageIndex * 0.12, row: row.number - 1 },
            ext: { width: 42, height: 42 }
          });
        });
      }
    }

    const meta = workbook.addWorksheet("__meta");
    meta.state = "hidden";
    meta.addRow(["templateVersion", "1"]);
    context.moodOptions.forEach((item, index) => {
      meta.addRow(["mood", index + 1, item.key, item.label]);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      __raw: true,
      value: new StreamableFile(Buffer.from(buffer), {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: `attachment; filename="products-export.xlsx"`
      })
    };
  }

  async preview(restaurantId: string, file: Express.Multer.File) {
    this.assertExcelFile(file);
    const context = await this.loadContext(restaurantId);
    const parsed = await this.parseWorkbookOrThrow(file.buffer, context.moodOptions);
    const validatedRows = this.validateRows(parsed.rows, context);
    const validRows = validatedRows.filter((row) => row.isValid).length;
    const globalErrors = [...parsed.globalErrors, ...this.limitErrors(context, validRows)];

    return {
      summary: {
        totalRows: validatedRows.length,
        validRows,
        invalidRows: validatedRows.length - validRows,
        imagesCount: parsed.totalImages,
        wouldImport: globalErrors.length ? 0 : validRows,
        maxProducts: context.productLimit,
        currentProducts: context.currentProductCount,
        remainingProducts: context.productLimit === null ? null : Math.max(0, context.productLimit - context.currentProductCount),
        pages: Math.max(1, Math.ceil(validatedRows.length / 10))
      },
      globalErrors,
      rows: validatedRows.map((row) => this.serializePreviewRow(row))
    };
  }

  async import(restaurantId: string, userId: string | undefined, file: Express.Multer.File) {
    const preview = await this.preview(restaurantId, file);
    if (preview.globalErrors.length || preview.rows.some((row) => !row.isValid)) {
      throw new BadRequestException({
        message: "يوجد أخطاء في الملف. أصلح الأخطاء ثم حاول مرة ثانية.",
        preview
      });
    }

    const context = await this.loadContext(restaurantId);
    const parsed = await this.parseWorkbookOrThrow(file.buffer, context.moodOptions);
    const rows = this.validateRows(parsed.rows, context).filter((row) => row.isValid);
    const uploaded: StoredUpload[] = [];

    try {
      const rowUploads = new Map<number, StoredUpload[]>();
      for (const row of rows) {
        const uploads = await this.uploadRowImages(row.images, row.name);
        uploads.forEach((upload) => uploaded.push(upload));
        rowUploads.set(row.rowNumber, uploads);
      }

      await this.prisma.$transaction(async (tx) => {
        for (const [rowIndex, row] of rows.entries()) {
          const mediaAssets = await this.createMediaAssets(tx, restaurantId, userId, row, rowUploads.get(row.rowNumber) ?? []);
          await this.productsService.createImportedProduct(tx, restaurantId, {
            categoryId: row.categoryId!,
            name: row.name,
            description: row.description || null,
            basePrice: row.basePrice!,
            currency: context.restaurant.currency,
            isPopular: row.isPopular,
            isNew: row.isNew,
            moodKeys: row.moodKeys,
            ingredients: row.resolvedIngredients as Prisma.InputJsonValue[],
            nutrition: { details: row.resolvedMealDetails } as Prisma.InputJsonValue,
            images: mediaAssets.map((media, imageIndex) => ({
              mediaId: media.id,
              url: media.url,
              altText: `${row.name} ${imageIndex + 1}`
            })),
            sortOrder: context.nextSortOrder + rowIndex
          });
        }
      }, {
        maxWait: 10000,
        timeout: 60000
      });

      return { importedCount: rows.length };
    } catch (error) {
      await Promise.all(uploaded.map((upload) => this.storage.cleanupStoredUpload(upload)));
      throw error;
    }
  }

  private async loadContext(restaurantId: string): Promise<ImportContext> {
    await this.productLibrary.backfillLegacyLibrary();

    const [restaurant, categories, ingredients, mealDetails, productCount, productLimit, maxSort, moodOptions] = await Promise.all([
      this.prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { id: true, currency: true }
      }),
      this.prisma.category.findMany({
        where: { restaurantId, deletedAt: null, isActive: true },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" }
      }),
      this.prisma.ingredientLibraryItem.findMany({
        where: { isActive: true },
        orderBy: { adminName: "asc" }
      }),
      this.prisma.mealDetailLibraryItem.findMany({
        where: { isActive: true },
        orderBy: { adminName: "asc" }
      }),
      this.prisma.product.count({ where: { restaurantId, deletedAt: null } }),
      this.featureFlags.getFeatureLimit(restaurantId, "MAX_PRODUCTS"),
      this.prisma.product.aggregate({ where: { restaurantId, deletedAt: null }, _max: { sortOrder: true } }),
      this.loadMoodOptions(restaurantId)
    ]);

    return {
      restaurant,
      categories: this.groupByNormalizedName(categories),
      ingredients: new Map(ingredients.map((item) => [item.adminNameNormalized, this.productLibrary.ingredientSnapshot(item)])),
      mealDetails: new Map(mealDetails.map((item) => [item.adminNameNormalized, this.productLibrary.mealDetailSnapshot(item)])),
      moodOptions,
      currentProductCount: productCount,
      productLimit,
      nextSortOrder: (maxSort._max.sortOrder ?? 0) + 1
    };
  }

  private validateRows(rows: ProductImportParsedRow[], context: ImportContext): ValidatedImportRow[] {
    return rows.map((row) => {
      const errors = [...row.errors];
      const categoryMatches = context.categories.get(this.normalize(row.categoryName)) ?? [];
      const categoryId = categoryMatches.length === 1 ? categoryMatches[0].id : null;

      if (row.categoryName && !categoryMatches.length) {
        errors.push(`القسم "${row.categoryName}" غير موجود لهذا المطعم`);
      }

      if (categoryMatches.length > 1) {
        errors.push(`القسم "${row.categoryName}" غير واضح بسبب تكرار الاسم`);
      }

      const resolvedIngredients = this.resolveLibraryItems(row.ingredientNames, context.ingredients, "المكون", errors);
      const resolvedMealDetails = this.resolveLibraryItems(row.mealDetailNames, context.mealDetails, "تفاصيل الوجبة", errors);

      return {
        ...row,
        errors,
        categoryId,
        resolvedIngredients,
        resolvedMealDetails,
        isValid: errors.length === 0
      };
    });
  }

  private resolveLibraryItems<T>(names: string[], lookup: Map<string, T>, label: string, errors: string[]) {
    const resolved: T[] = [];
    for (const name of names) {
      const item = lookup.get(this.normalize(name));
      if (!item) {
        errors.push(`${label} "${name}" غير موجود أو غير فعال في المكتبة`);
      } else {
        resolved.push(item);
      }
    }

    return resolved;
  }

  private limitErrors(context: ImportContext, validRows: number) {
    if (context.productLimit !== null && context.currentProductCount + validRows > context.productLimit) {
      return [
        `عدد المنتجات يتجاوز حد الاشتراك MAX_PRODUCTS. الحالي ${context.currentProductCount}، الصالح للاستيراد ${validRows}، الحد ${context.productLimit}.`
      ];
    }

    return [];
  }

  private async uploadRowImages(images: ProductImportParsedImage[], productName: string) {
    const uploads: StoredUpload[] = [];
    for (const [index, image] of images.entries()) {
      uploads.push(await this.storage.storeBuffer({
        buffer: image.buffer,
        originalFilename: `${productName || "product"}-${image.rowNumber}-${index + 1}.${image.extension}`,
        mimeType: image.mimeType,
        type: "IMAGE"
      }));
    }

    return uploads;
  }

  private async createMediaAssets(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    userId: string | undefined,
    row: ValidatedImportRow,
    uploads: StoredUpload[]
  ) {
    const mediaAssets: Array<{ id: string; url: string }> = [];
    for (const upload of uploads) {
      const media = await tx.mediaAsset.create({
        data: {
          restaurantId,
          createdById: userId,
          filename: upload.filename,
          originalFilename: upload.originalFilename,
          mimeType: upload.mimeType,
          url: upload.url,
          originalUrl: upload.url,
          type: "IMAGE",
          size: upload.size,
          altText: row.name,
          provider: upload.provider,
          blurDataUrl: `${upload.url}.blur.jpg`,
          metadata: {
            responsive: true,
            progressive: true,
            source: "excel-import-v1",
            ...(upload.metadata ?? {})
          }
        }
      });
      mediaAssets.push({ id: media.id, url: media.url });
    }

    return mediaAssets;
  }

  private serializePreviewRow(row: ValidatedImportRow) {
    return {
      rowNumber: row.rowNumber,
      name: row.name,
      category: row.categoryName,
      basePrice: row.basePrice,
      isPopular: row.isPopular,
      isNew: row.isNew,
      moodKeys: row.moodKeys,
      ingredients: row.ingredientNames,
      mealDetails: row.mealDetailNames,
      imagesCount: row.images.length,
      isValid: row.isValid,
      errors: row.errors
    };
  }

  private async parseWorkbookOrThrow(buffer: Buffer, fallbackMoodOptions: ProductImportMoodOption[] = []) {
    try {
      return await parseProductImportWorkbook(buffer, fallbackMoodOptions);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "ملف Excel غير صالح");
    }
  }

  private assertExcelFile(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Excel file is required");
    }

    if (file.size > PRODUCT_IMPORT_LIMITS.maxFileBytes) {
      throw new BadRequestException(`حجم ملف Excel أكبر من الحد المسموح (${Math.round(PRODUCT_IMPORT_LIMITS.maxFileBytes / 1024 / 1024)}MB).`);
    }

    const name = file.originalname.toLocaleLowerCase();
    if (!name.endsWith(".xlsx")) {
      throw new BadRequestException("الملف يجب أن يكون بصيغة .xlsx");
    }
  }

  private groupByNormalizedName(items: Array<{ id: string; name: string }>) {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    for (const item of items) {
      const key = this.normalize(item.name);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }

  private async loadMoodOptions(restaurantId: string) {
    const sections = await this.prisma.menuSection.findMany({
      where: {
        isActive: true,
        page: { menu: { restaurantId } }
      },
      select: { type: true, settings: true, sortOrder: true },
      orderBy: { sortOrder: "asc" }
    });

    const section = sections.find((item) => item.type === "MOOD_STRIP" && this.extractMoodItems(item.settings).length)
      ?? sections.find((item) => this.extractMoodItems(item.settings).length);

    return this.extractMoodItems(section?.settings)
      .map((item) => {
        const label = this.moodItemText(item.label) || this.moodItemText(item.name) || this.moodItemText(item.title) || this.moodItemText(item.text);
        const key = this.moodItemText(item.key) || this.moodItemText(item.id) || this.moodItemText(item.value) || label;
        return label ? { key, label } : null;
      })
      .filter((item): item is { key: string; label: string } => Boolean(item));
  }

  private extractMoodItems(settings: Prisma.JsonValue | undefined) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) return [];
    const record = settings as { moodItems?: unknown; items?: unknown };
    const items = Array.isArray(record.moodItems) ? record.moodItems : Array.isArray(record.items) ? record.items : [];
    return items.filter((item): item is Record<string, Prisma.JsonValue> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }

  private moodItemText(value: Prisma.JsonValue | undefined) {
    return typeof value === "string" ? value.trim() : "";
  }

  private parseStoredMoodKeys(value: string | null) {
    if (!value?.trim()) return [];

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return this.uniqueStrings(parsed.filter((item): item is string => typeof item === "string"));
      }
      if (typeof parsed === "string") {
        return this.uniqueStrings([parsed]);
      }
    } catch {
      return this.uniqueStrings([value]);
    }

    return [];
  }

  private exportLibraryNames(value: Prisma.JsonValue | null, keys: string[]) {
    if (!Array.isArray(value)) return [];

    return this.uniqueStrings(value.map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";

      const record = item as Record<string, Prisma.JsonValue>;
      for (const key of keys) {
        const next = record[key];
        if (typeof next === "string" && next.trim()) {
          return next.trim();
        }
      }

      return "";
    }));
  }

  private exportMealDetailNames(nutrition: Prisma.JsonValue | null) {
    if (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition)) return [];

    const record = nutrition as Record<string, Prisma.JsonValue>;
    return this.exportLibraryNames(record.details ?? null, ["adminName", "displayName", "label", "value"]);
  }

  private async loadExportImages(urls: string[]) {
    const images: ExportableWorkbookImage[] = [];
    for (const url of urls.slice(0, PRODUCT_IMPORT_LIMITS.maxImagesPerProduct)) {
      const extension = this.workbookImageExtension(url);
      if (!extension) continue;

      const buffer = await this.readImageBuffer(url).catch(() => null);
      if (buffer?.length) {
        images.push({ buffer, extension });
      }
    }

    return images;
  }

  private workbookImageExtension(url: string): ExportableWorkbookImage["extension"] | null {
    const extension = extname(this.urlPathname(url)).toLocaleLowerCase();
    if (extension === ".png") return "png";
    if (extension === ".jpg" || extension === ".jpeg") return "jpeg";
    return null;
  }

  private async readImageBuffer(url: string) {
    for (const localPath of this.localUploadPaths(url)) {
      const buffer = await readFile(localPath).catch(() => null);
      if (buffer) return buffer;
    }

    if (/^https?:\/\//i.test(url)) {
      const response = await fetch(url);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    }

    return null;
  }

  private localUploadPaths(url: string) {
    const pathname = this.urlPathname(url);
    if (!pathname.startsWith("/uploads/")) return [];

    const filename = basename(pathname);
    return [
      resolve("uploads", filename),
      resolve("apps/api/uploads", filename)
    ];
  }

  private urlPathname(url: string) {
    if (url.startsWith("/")) return url;

    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  private uniqueStrings(values: string[]) {
    const seen = new Set<string>();
    return values
      .map((value) => value.trim())
      .filter((value) => {
        const key = value.toLocaleLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private normalize(value: string) {
    return value.trim().toLocaleLowerCase();
  }
}
