import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { productEditorFingerprint, validateCurrencyAmount, currencyDisplayScale, validateConfigurationV2,
  type ProductEditorAggregate, type ProductEditorFields, type SaveProductEditor, type ProductConfigurationV2 } from "@menu/shared";
import { PrismaService } from "../prisma/prisma.service";
import { allowedImageReference, approvedModelFormat } from "../media/asset-reference";
import { nextProductSortOrder } from "./product-sort-order";
import { slugify } from "../../common/slugify";
import { persistProductConfigurationInTransaction, ProductConfigurationValidationError,
  ProductConfigurationConflictError, ProductConfigurationCapabilityError } from "./product-configuration.persistence";

const include = {
  images: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const } },
  media3d: true, vrMedia: true,
  configurationDependencies: { orderBy: { path: "asc" as const } }
};
type Row = Prisma.ProductGetPayload<{ include: typeof include }>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

@Injectable()
export class ProductEditorService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(restaurantId: string, id: string) {
    return this.prisma.$transaction(async tx => this.readInTransaction(tx, restaurantId, id),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async readInTransaction(tx: Prisma.TransactionClient, restaurantId: string, id: string): Promise<ProductEditorAggregate> {
    const row = await tx.product.findFirst({ where: { id, restaurantId, deletedAt: null }, include });
    if (!row) throw new NotFoundException("Product not found");
    const restaurant = await tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null } });
    if (!restaurant) throw new NotFoundException("Restaurant not found");
    return {
      id, currency: restaurant.currency, editVersion: row.editVersion,
      configurationVersion: row.configurationVersion,
      primaryImageId: row.images[0]?.id ?? null,
      product: this.fields(row),
      configuration: row.configurationTree as unknown as ProductConfigurationV2 | null,
      dependencies: row.configurationDependencies.map(({ sourceProductId, optionId, path, mode }) => ({ sourceProductId, optionId, path, mode })),
      advancedMedia: { model3dUrl: row.media3d?.isActive ? row.media3d.url : "",
        model3dFormat: row.media3d?.format ?? "GLB", vrUrl: row.vrMedia?.isActive ? row.vrMedia.panoramaUrl : "" }
    };
  }

  private fields(row: Row): ProductEditorFields {
    let moodKeys: string[] = [];
    if (row.moodKey) {
      try { const parsed: unknown = JSON.parse(row.moodKey); moodKeys = Array.isArray(parsed) ? parsed.filter(x => typeof x === "string") : [row.moodKey]; }
      catch { moodKeys = [row.moodKey]; }
    }
    const ingredients = Array.isArray(row.ingredients) ? row.ingredients.map(x => typeof x === "string" ? { name: x } : x) : [];
    const nutrition = object(row.nutrition);
    // Preserve the existing ordinary-product four-detail representation on first reopen.
    const details = Array.isArray(nutrition.details) ? nutrition.details : [
      ["weight", "الوزن التقريبي", "scale"], ["protein", "نوع البروتين", "drumstick"],
      ["breadType", "نوع الخبز", "wheat"], ["spice", "مستوى الحدة", "flame"]
    ].filter(([key]) => typeof nutrition[key] === "string" && nutrition[key])
      .map(([key, label, icon]) => ({ label, value: nutrition[key], icon }));
    return { name: row.name, description: row.description ?? "", categoryId: row.categoryId,
      basePrice: row.basePrice?.toString() ?? null, isNew: row.isNew, isFeatured: row.isFeatured, isPopular: row.isPopular,
      moodKeys, images: row.images.map(x => ({ id: x.id, url: x.url, altText: x.altText ?? "" })),
      ingredients: ingredients as ProductEditorFields["ingredients"],
      mealDetails: details as ProductEditorFields["mealDetails"] };
  }

  async save(restaurantId: string, id: string, input: SaveProductEditor, allowAdvancedMedia = false) {
    this.validateInput(id, input);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const restaurant = await tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null } });
          if (!restaurant) throw new NotFoundException("Restaurant not found");
          const existing = await tx.product.findUnique({ where: { id }, include });
          if (input.create ? Boolean(existing) : !existing || existing.restaurantId !== restaurantId || existing.deletedAt !== null) {
            if (!input.create) throw new NotFoundException("Product not found");
            throw new ConflictException({ error: "PRODUCT_ID_ALREADY_EXISTS", message: "Read the saved product before retrying creation." });
          }
          if (input.create && (input.expectedProductVersion !== 0 || input.expectedConfigurationVersion !== 0))
            this.conflict();
          if (existing && (existing.editVersion !== input.expectedProductVersion ||
            existing.configurationVersion !== input.expectedConfigurationVersion)) this.conflict();
          const p = input.product;
          // New galleries are limited to five. Existing larger galleries may be retained,
          // reordered or reduced, but cannot receive new references above that limit.
          if (p.images.length > 5 && (!existing || p.images.some(image => !existing.images.some(old => old.url === image.url))))
            this.invalid("product.images", "At most five images; an existing larger gallery may only retain or remove its saved images");
          if (p.categoryId && !await tx.category.findFirst({ where: { id: p.categoryId, restaurantId, deletedAt: null } }))
            this.invalid("product.categoryId", "Category unavailable");
          const subscription = await tx.restaurantSubscription.findUnique({ where: { restaurantId }, include: { plan: { include: { features: true } } } });
          if (input.create) {
            const limit = subscription?.plan.features.find(f => f.key === "MAX_PRODUCTS")?.limit;
            if (limit !== null && limit !== undefined && await tx.product.count({ where: { restaurantId, deletedAt: null } }) >= limit)
              throw new ForbiddenException("Product limit reached");
          }
          const hasConfiguration = input.configuration !== undefined || existing?.configurationTree != null;
          if (!hasConfiguration && p.basePrice === null) this.invalid("product.basePrice", "Base price is required");
          if (p.basePrice !== null) {
            const issues = validateCurrencyAmount(p.basePrice, restaurant.currency, "product.basePrice");
            const scale = currencyDisplayScale(restaurant.currency);
            if (issues.length || scale === 2 && (p.basePrice.split(".")[1]?.replace(/0+$/, "").length ?? 0) > 2)
              this.invalid("product.basePrice", "Invalid price precision for restaurant currency");
          }
          // A metadata save cannot silently change the price owned by the saved configuration.
          const savedBase = existing?.basePrice?.toString() ?? null;
          if (hasConfiguration && input.configuration === undefined && p.basePrice !== savedBase)
            this.invalid("product.basePrice", "Change network pricing through configuration");
          if (input.configuration && (p.basePrice === null || input.configuration.basePrice === null
            ? p.basePrice !== input.configuration.basePrice : !new Prisma.Decimal(p.basePrice).equals(input.configuration.basePrice)))
            this.invalid("product.basePrice", "Product and configuration Base prices must agree");
          for (const image of p.images) await allowedImageReference(tx, restaurantId, image.url);
          const ingredients = await this.resolveLibrary(tx, restaurantId, p.ingredients, false);
          const details = await this.resolveLibrary(tx, restaurantId, p.mealDetails, true);
          const nutrition = { ...object(existing?.nutrition), details };
          const data = {
            name: p.name, description: p.description, categoryId: p.categoryId,
            ...(input.create||existing?.categoryId!==p.categoryId?{sortOrder:await nextProductSortOrder(tx,restaurantId,p.categoryId)}:{}),
            ...(!hasConfiguration ? { basePrice: p.basePrice === null ? null : new Prisma.Decimal(p.basePrice) } : {}),
            currency: restaurant.currency,
            isNew: p.isNew, isFeatured: p.isFeatured, isPopular: p.isPopular,
            moodKey: p.moodKeys.length ? JSON.stringify(p.moodKeys) : null,
            ingredients: json(ingredients), nutrition: json(nutrition)
          };
          if (input.create) {
            let slug = slugify(p.name) || "product";
            const base = slug;
            let suffix = 2;
            while (await tx.product.findFirst({ where: { restaurantId, slug } })) slug = base + "-" + suffix++;
            await tx.product.create({ data: { ...data, id, restaurantId, slug, editVersion: 1,
              ...(input.configuration ? { configurationTree: json(input.configuration),
                configurationVersion: input.configuration.revision,
                basePrice: p.basePrice === null ? null : new Prisma.Decimal(p.basePrice) } : {}),
              ...(hasConfiguration ? { isAvailable: false } : {}) } });
          } else {
            const updated = await tx.product.updateMany({
              where: { id, restaurantId, deletedAt: null, editVersion: input.expectedProductVersion,
                configurationVersion: input.expectedConfigurationVersion },
              data: { ...data, editVersion: { increment: 1 } }
            });
            if (updated.count !== 1) this.conflict();
          }
          if (input.configuration !== undefined) {
            const { revision: ignored, ...content } = input.configuration;
            const { revision: savedRevision, ...saved } = object(existing?.configurationTree);
            if (input.configuration.revision !== input.expectedConfigurationVersion + 1)
              this.conflict("CONFIGURATION_VERSION_CONFLICT");
            if (productEditorFingerprint(content) !== productEditorFingerprint(saved)) {
              await persistProductConfigurationInTransaction(tx, {
                restaurantId, productId: id, expectedVersion: input.expectedConfigurationVersion,
                configuration: input.configuration, requiredCapabilityKey: "PRODUCT_CONFIGURATION", newProduct: input.create
              });
            }
          }
          // Preserve owned image identities and primary-image identity across metadata saves/reordering.
          // Only removed relationships are deleted; no external storage object is removed.
          const retained = p.images.map(image => {
            const old = image.id ? existing?.images.find(x => x.id === image.id)
              : existing?.images.find(x => x.url === image.url);
            if (image.id && !old) this.invalid("product.images", "Image identity does not belong to this product");
            return { image, old };
          });
          const ownedIds = retained.flatMap(x => x.old ? [x.old.id] : []);
          if (new Set(ownedIds).size !== ownedIds.length) this.invalid("product.images", "Duplicate image identity");
          await tx.productImage.deleteMany({ where: { productId: id, id: { notIn: retained.flatMap(x => x.old ? [x.old.id] : []) } } });
          if (p.images.length) {
            const assets = await tx.mediaAsset.findMany({ where: { restaurantId, url: { in: p.images.map(x => x.url) } } });
            for (const [sortOrder, { image, old }] of retained.entries()) {
              const data = { url: image.url, altText: image.altText, sortOrder,
                mediaId: assets.find(x => x.url === image.url)?.id ?? null };
              if (old) await tx.productImage.update({ where: { id: old.id }, data });
              else await tx.productImage.create({ data: { ...data, productId: id } });
            }
          }
          if (input.advancedMedia !== undefined) {
            if (!allowAdvancedMedia) throw new ForbiddenException("Advanced media requires SUPER_ADMIN");
            const media = input.advancedMedia;
            if (media.model3dUrl) {
              const format = await approvedModelFormat(tx, restaurantId, media.model3dUrl);
              await tx.product3DModel.upsert({ where: { productId: id },
                create: { productId: id, url: media.model3dUrl, format }, update: { url: media.model3dUrl, format, isActive: true } });
            } else await tx.product3DModel.updateMany({ where: { productId: id }, data: { isActive: false } });
            if (media.vrUrl) {
              await allowedImageReference(tx, restaurantId, media.vrUrl);
              await tx.productVrMedia.upsert({ where: { productId: id },
                create: { productId: id, panoramaUrl: media.vrUrl, type: "PANORAMA" },
                update: { panoramaUrl: media.vrUrl, type: "PANORAMA", isActive: true } });
            } else await tx.productVrMedia.updateMany({ where: { productId: id }, data: { isActive: false } });
          }
          return this.readInTransaction(tx, restaurantId, id);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034" && attempt < 2) continue;
        if (e instanceof ProductConfigurationValidationError) throw new BadRequestException({ error: e.kind, issues: e.issues });
        if (e instanceof ProductConfigurationConflictError) throw new ConflictException({ error: e.code, message: e.message });
        if (e instanceof ProductConfigurationCapabilityError) throw new ForbiddenException("Product Configuration capability is not assigned");
        if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(e.code)) this.conflict();
        throw e;
      }
    }
    this.conflict();
  }

  private async resolveLibrary(tx: Prisma.TransactionClient, restaurantId: string,
    items: ProductEditorFields["ingredients"] | ProductEditorFields["mealDetails"], detail: boolean) {
    const seen = new Set<string>();
    const resolved: Record<string, unknown>[] = [];
    for (const raw of items) {
      const item = raw as ProductEditorFields["mealDetails"][number] & ProductEditorFields["ingredients"][number];
      if (item.libraryId) {
        if (seen.has(item.libraryId)) this.invalid(detail ? "product.mealDetails" : "product.ingredients", "Duplicate library selection");
        seen.add(item.libraryId);
        if (detail) {
          const library = await tx.mealDetailLibraryItem.findFirst({ where: { id: item.libraryId, isActive: true } });
          if (!library) this.invalid("product.mealDetails", "Library item unavailable");
          const value = library.valueType === "PRESENCE" ? "" : item.value;
          if (library.valueType === "VALUE" && !value.trim()) this.invalid("product.mealDetails", "Detail value is required");
          resolved.push({ libraryId: library.id, adminName: library.adminName, displayName: library.displayName,
            label: library.displayName, value, valueType: library.valueType, icon: library.icon, iconUrl: library.iconUrl ?? "" });
        } else {
          const library = await tx.ingredientLibraryItem.findFirst({ where: { id: item.libraryId, isActive: true } });
          if (!library) this.invalid("product.ingredients", "Library item unavailable");
          resolved.push({ libraryId: library.id, adminName: library.adminName, displayName: library.displayName,
            name: library.displayName, imageUrl: library.imageUrl ?? "" });
        }
      } else {
        // Ordinary products already permit local descriptive entries; never use them as library identities.
        if (item.imageUrl) await allowedImageReference(tx, restaurantId, item.imageUrl);
        if (item.iconUrl) await allowedImageReference(tx, restaurantId, item.iconUrl);
        resolved.push(detail ? { label: item.label, value: item.value, icon: item.icon, iconUrl: item.iconUrl ?? "" }
          : { name: item.name, imageUrl: item.imageUrl ?? "" });
      }
    }
    return resolved;
  }

  private invalid(path: string, message: string): never {
    throw new BadRequestException({ error: "PRODUCT_EDITOR_VALIDATION", issues: [{ path, message, code: "INVALID_FIELD" }] });
  }
  private conflict(error = "PRODUCT_EDIT_VERSION_CONFLICT"): never {
    throw new ConflictException({ error, message: "The product changed. Reload before saving this draft." });
  }
  private validateInput(id: string, input: SaveProductEditor) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) this.invalid("id", "Invalid product identity");
    if (typeof input.create !== "boolean" || !Number.isSafeInteger(input.expectedProductVersion) || input.expectedProductVersion < 0 ||
      !Number.isSafeInteger(input.expectedConfigurationVersion) || input.expectedConfigurationVersion < 0) this.invalid("versions", "Expected versions are required");
    const p = input.product;
    const text = (v: unknown, max = 2000) => typeof v === "string" && v.length <= max;
    const allowed = ["name", "description", "categoryId", "basePrice", "isNew", "isFeatured", "isPopular", "moodKeys", "images", "ingredients", "mealDetails"];
    if (!p || Object.keys(p).some(k => !allowed.includes(k)) || !text(p.name, 200) || !p.name.trim() ||
      !text(p.description, 10000) || !(p.categoryId === null || text(p.categoryId, 128)) ||
      !(p.basePrice === null || text(p.basePrice, 30)) || typeof p.isNew !== "boolean" || typeof p.isFeatured !== "boolean" || typeof p.isPopular !== "boolean")
      this.invalid("product", "Invalid editor fields");
    if (!Array.isArray(p.moodKeys) || p.moodKeys.length > 30 || p.moodKeys.some(x => !text(x, 100)) ||
      !Array.isArray(p.images) || p.images.length > 30 || p.images.some(x => !x || !text(x.url) || !text(x.altText, 300) || x.id !== undefined && !text(x.id, 128)) ||
      new Set(p.images.map(x => x.url)).size !== p.images.length ||
      new Set(p.images.filter(x => x.id).map(x => x.id)).size !== p.images.filter(x => x.id).length) this.invalid("product.images", "Invalid or duplicate images/moods");
    for (const [key, list] of [["ingredients", p.ingredients], ["mealDetails", p.mealDetails]] as const) {
      if (!Array.isArray(list) || list.length > 100) this.invalid("product." + key, "Invalid selections");
      for (const raw of list) {
        const x = object(raw);
        if (Object.values(x).some(v => v !== undefined && !text(v)) ||
          key === "ingredients" && (!text(x.name, 200) || !(x.name as string).trim()) ||
          key === "mealDetails" && (!text(x.label, 200) || !(x.label as string).trim() || !text(x.value, 500) || !text(x.icon, 100)))
          this.invalid("product." + key, "Invalid selection");
      }
    }
    if (input.advancedMedia !== undefined && (!input.advancedMedia || !text(input.advancedMedia.model3dUrl) || !text(input.advancedMedia.model3dFormat, 20) ||
      !text(input.advancedMedia.vrUrl))) this.invalid("advancedMedia", "Invalid advanced media");
    if (input.configuration === null) this.invalid("configuration", "Configuration removal is not supported");
    if (input.configuration !== undefined) {
      const issues = validateConfigurationV2(input.configuration);
      if (issues.length) throw new BadRequestException({ error: "PRODUCT_CONFIGURATION_VALIDATION", issues });
      if (input.configuration.productId !== id) this.invalid("configuration.productId", "Configuration identity mismatch");
    }
  }
}
