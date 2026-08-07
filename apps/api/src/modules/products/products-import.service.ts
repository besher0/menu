import { BadRequestException, Inject, Injectable, StreamableFile } from "@nestjs/common";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { MediaStorageService, StoredUpload } from "../media/media-storage.service";
import { ProductLibraryService } from "../media/product-library.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  parseProductImportWorkbook,
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_LIMITS,
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
    products.getCell("H2").note = "مثال: true,,true يعني اختيار المزاج الأول والثالث حسب ترتيب الشيت المخفي.";
    products.getCell("F2").note = "اكتب true أو false أو اتركها فارغة.";
    products.getCell("G2").note = "اكتب true أو false أو اتركها فارغة.";

    const instructions = workbook.addWorksheet("Instructions", { views: [{ rightToLeft: true }] });
    instructions.addRows([
      ["طريقة الاستخدام"],
      ["1. املأ Sheet Products فقط، ولا تضف restaurantId."],
      ["2. ضع صور المنتج كصور embedded داخل الخلية/منطقة العمود A في نفس صف المنتج."],
      ["3. أسماء الأقسام والمكونات وتفاصيل الوجبة يجب أن تطابق اسم الإدارة."],
      ["4. قيم true/false يجب كتابتها بالإنكليزي، والفراغ يعني false."],
      ["5. شو مزاجك اليوم يستخدم ترتيب الخيارات: true,,true يعني الأول والثالث."],
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

  async preview(restaurantId: string, file: Express.Multer.File) {
    this.assertExcelFile(file);
    const parsed = await this.parseWorkbookOrThrow(file.buffer);
    const context = await this.loadContext(restaurantId);
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

    const parsed = await this.parseWorkbookOrThrow(file.buffer);
    const context = await this.loadContext(restaurantId);
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
        where: { restaurantId, isActive: true },
        orderBy: { adminName: "asc" }
      }),
      this.prisma.mealDetailLibraryItem.findMany({
        where: { restaurantId, isActive: true },
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

  private async parseWorkbookOrThrow(buffer: Buffer) {
    try {
      return await parseProductImportWorkbook(buffer);
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
        type: "MOOD_STRIP",
        isActive: true,
        page: { menu: { restaurantId } }
      },
      select: { settings: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
      take: 3
    });
    const section = sections.find((item) => {
      const settings = item.settings as Record<string, unknown>;
      return Array.isArray(settings?.moodItems) && settings.moodItems.length;
    });
    const settings = section?.settings as { moodItems?: Array<{ key?: string; label?: string }> } | undefined;

    return (settings?.moodItems ?? [])
      .map((item) => {
        const label = item.label?.trim() ?? "";
        const key = item.key?.trim() || label;
        return label ? { key, label } : null;
      })
      .filter((item): item is { key: string; label: string } => Boolean(item));
  }

  private normalize(value: string) {
    return value.trim().toLocaleLowerCase();
  }
}
