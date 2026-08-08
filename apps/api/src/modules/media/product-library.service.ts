import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertIngredientLibraryItemDto } from "./dto/upsert-ingredient-library-item.dto";
import { UpsertMealDetailLibraryItemDto } from "./dto/upsert-meal-detail-library-item.dto";

export type IngredientSnapshot = {
  libraryId: string;
  adminName: string;
  displayName: string;
  name: string;
  imageUrl: string;
};

export type MealDetailSnapshot = {
  libraryId: string;
  adminName: string;
  displayName: string;
  label: string;
  value: string;
  icon: string;
  iconUrl: string;
};

@Injectable()
export class ProductLibraryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  normalizeAdminName(value: string) {
    return value.trim().toLocaleLowerCase();
  }

  async backfillLegacyLibrary(restaurantId: string) {
    await this.backfillLegacyIngredients(restaurantId);
    await this.backfillLegacyMealDetails(restaurantId);
  }

  async listIngredients(restaurantId: string) {
    try {
      await this.backfillLegacyIngredients(restaurantId);
      const data = await this.prisma.ingredientLibraryItem.findMany({
        where: { restaurantId },
        orderBy: [{ isActive: "desc" }, { adminName: "asc" }]
      });

      return { data };
    } catch (error) {
      this.handleDatabaseError(error);
      throw error;
    }
  }

  async createIngredient(restaurantId: string, dto: UpsertIngredientLibraryItemDto) {
    const adminName = this.requiredName(dto.adminName, "Admin name is required");
    const displayName = this.requiredName(dto.displayName ?? dto.adminName, "Display name is required");

    try {
      return await this.prisma.ingredientLibraryItem.create({
        data: {
          restaurantId,
          adminName,
          adminNameNormalized: this.normalizeAdminName(adminName),
          displayName,
          imageUrl: this.cleanOptional(dto.imageUrl),
          isActive: dto.isActive ?? true
        }
      });
    } catch (error) {
      this.handleDatabaseError(error);
      this.handleUniqueError(error, "Ingredient admin name already exists");
      throw error;
    }
  }

  async updateIngredient(restaurantId: string, id: string, dto: UpsertIngredientLibraryItemDto) {
    try {
      await this.findIngredient(restaurantId, id);
      const adminName = dto.adminName !== undefined ? this.requiredName(dto.adminName, "Admin name is required") : undefined;
      const displayName = dto.displayName !== undefined ? this.requiredName(dto.displayName, "Display name is required") : undefined;

      return await this.prisma.ingredientLibraryItem.update({
        where: { id },
        data: {
          ...(adminName ? { adminName, adminNameNormalized: this.normalizeAdminName(adminName) } : {}),
          ...(displayName ? { displayName } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: this.cleanOptional(dto.imageUrl) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
        }
      });
    } catch (error) {
      this.handleDatabaseError(error);
      this.handleUniqueError(error, "Ingredient admin name already exists");
      throw error;
    }
  }

  async deleteIngredient(restaurantId: string, id: string) {
    try {
      await this.findIngredient(restaurantId, id);
      await this.prisma.ingredientLibraryItem.update({
        where: { id },
        data: { isActive: false }
      });
      return { deleted: true };
    } catch (error) {
      this.handleDatabaseError(error);
      throw error;
    }
  }

  async listMealDetails(restaurantId: string) {
    try {
      await this.backfillLegacyMealDetails(restaurantId);
      const data = await this.prisma.mealDetailLibraryItem.findMany({
        where: { restaurantId },
        orderBy: [{ isActive: "desc" }, { adminName: "asc" }]
      });

      return { data };
    } catch (error) {
      this.handleDatabaseError(error);
      throw error;
    }
  }

  async createMealDetail(restaurantId: string, dto: UpsertMealDetailLibraryItemDto) {
    const adminName = this.requiredName(dto.adminName, "Admin name is required");
    const displayName = this.requiredName(dto.displayName ?? dto.adminName, "Display name is required");

    try {
      return await this.prisma.mealDetailLibraryItem.create({
        data: {
          restaurantId,
          adminName,
          adminNameNormalized: this.normalizeAdminName(adminName),
          displayName,
          value: this.cleanOptional(dto.value),
          icon: this.cleanOptional(dto.icon) ?? "utensils",
          iconUrl: this.cleanOptional(dto.iconUrl),
          isActive: dto.isActive ?? true
        }
      });
    } catch (error) {
      this.handleDatabaseError(error);
      this.handleUniqueError(error, "Meal detail admin name already exists");
      throw error;
    }
  }

  async updateMealDetail(restaurantId: string, id: string, dto: UpsertMealDetailLibraryItemDto) {
    try {
      await this.findMealDetail(restaurantId, id);
      const adminName = dto.adminName !== undefined ? this.requiredName(dto.adminName, "Admin name is required") : undefined;
      const displayName = dto.displayName !== undefined ? this.requiredName(dto.displayName, "Display name is required") : undefined;

      return await this.prisma.mealDetailLibraryItem.update({
        where: { id },
        data: {
          ...(adminName ? { adminName, adminNameNormalized: this.normalizeAdminName(adminName) } : {}),
          ...(displayName ? { displayName } : {}),
          ...(dto.value !== undefined ? { value: this.cleanOptional(dto.value) } : {}),
          ...(dto.icon !== undefined ? { icon: this.cleanOptional(dto.icon) ?? "utensils" } : {}),
          ...(dto.iconUrl !== undefined ? { iconUrl: this.cleanOptional(dto.iconUrl) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
        }
      });
    } catch (error) {
      this.handleDatabaseError(error);
      this.handleUniqueError(error, "Meal detail admin name already exists");
      throw error;
    }
  }

  async deleteMealDetail(restaurantId: string, id: string) {
    try {
      await this.findMealDetail(restaurantId, id);
      await this.prisma.mealDetailLibraryItem.update({
        where: { id },
        data: { isActive: false }
      });
      return { deleted: true };
    } catch (error) {
      this.handleDatabaseError(error);
      throw error;
    }
  }

  async resolveIngredientSnapshots(restaurantId: string, adminNames: string[]) {
    const uniqueNames = this.uniqueNames(adminNames);
    if (!uniqueNames.length) return { snapshots: [] as IngredientSnapshot[], unknown: [] as string[] };

    const items = await this.prisma.ingredientLibraryItem.findMany({
      where: {
        restaurantId,
        isActive: true,
        adminNameNormalized: { in: uniqueNames.map((name) => this.normalizeAdminName(name)) }
      }
    });
    const byName = new Map(items.map((item) => [item.adminNameNormalized, item]));
    const snapshots: IngredientSnapshot[] = [];
    const unknown: string[] = [];

    for (const name of uniqueNames) {
      const item = byName.get(this.normalizeAdminName(name));
      if (!item) {
        unknown.push(name);
      } else {
        snapshots.push(this.ingredientSnapshot(item));
      }
    }

    return { snapshots, unknown };
  }

  async resolveMealDetailSnapshots(restaurantId: string, adminNames: string[]) {
    const uniqueNames = this.uniqueNames(adminNames);
    if (!uniqueNames.length) return { snapshots: [] as MealDetailSnapshot[], unknown: [] as string[] };

    const items = await this.prisma.mealDetailLibraryItem.findMany({
      where: {
        restaurantId,
        isActive: true,
        adminNameNormalized: { in: uniqueNames.map((name) => this.normalizeAdminName(name)) }
      }
    });
    const byName = new Map(items.map((item) => [item.adminNameNormalized, item]));
    const snapshots: MealDetailSnapshot[] = [];
    const unknown: string[] = [];

    for (const name of uniqueNames) {
      const item = byName.get(this.normalizeAdminName(name));
      if (!item) {
        unknown.push(name);
      } else {
        snapshots.push(this.mealDetailSnapshot(item));
      }
    }

    return { snapshots, unknown };
  }

  ingredientSnapshot(item: {
    id: string;
    adminName: string;
    displayName: string;
    imageUrl: string | null;
  }): IngredientSnapshot {
    return {
      libraryId: item.id,
      adminName: item.adminName,
      displayName: item.displayName,
      name: item.displayName,
      imageUrl: item.imageUrl ?? ""
    };
  }

  mealDetailSnapshot(item: {
    id: string;
    adminName: string;
    displayName: string;
    value: string | null;
    icon: string;
    iconUrl: string | null;
  }): MealDetailSnapshot {
    return {
      libraryId: item.id,
      adminName: item.adminName,
      displayName: item.displayName,
      label: item.displayName,
      value: item.value ?? "",
      icon: item.icon || "utensils",
      iconUrl: item.iconUrl ?? ""
    };
  }

  private async findIngredient(restaurantId: string, id: string) {
    const item = await this.prisma.ingredientLibraryItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw new NotFoundException("Ingredient library item not found");
    return item;
  }

  private async findMealDetail(restaurantId: string, id: string) {
    const item = await this.prisma.mealDetailLibraryItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw new NotFoundException("Meal detail library item not found");
    return item;
  }

  private async backfillLegacyIngredients(restaurantId: string) {
    const products = await this.prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      select: { ingredients: true },
      orderBy: { updatedAt: "desc" }
    });
    const drafts = new Map<string, { adminName: string; displayName: string; imageUrl: string }>();

    for (const product of products) {
      const ingredients = this.legacyArray(product.ingredients);
      if (!ingredients.length) continue;

      for (const item of ingredients) {
        const normalized = this.normalizeLegacyIngredient(item);
        if (!normalized) continue;

        const adminName = normalized.adminName || normalized.displayName || normalized.name;
        const key = this.normalizeAdminName(adminName);
        if (!key) continue;

        const existing = drafts.get(key);
        if (existing) {
          if (!existing.imageUrl && normalized.imageUrl) existing.imageUrl = normalized.imageUrl;
          continue;
        }

        drafts.set(key, {
          adminName,
          displayName: normalized.displayName || normalized.name || adminName,
          imageUrl: normalized.imageUrl
        });
      }
    }

    await this.createMissingIngredients(restaurantId, drafts);
  }

  private async backfillLegacyMealDetails(restaurantId: string) {
    const products = await this.prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      select: { nutrition: true },
      orderBy: { updatedAt: "desc" }
    });
    const drafts = new Map<string, { adminName: string; displayName: string; value: string; icon: string; iconUrl: string }>();

    for (const product of products) {
      for (const detail of this.normalizeLegacyMealDetails(product.nutrition)) {
        const adminName = detail.adminName || detail.displayName || detail.label;
        const key = this.normalizeAdminName(adminName);
        if (!key || drafts.has(key)) continue;

        drafts.set(key, {
          adminName,
          displayName: detail.displayName || detail.label || adminName,
          value: detail.value,
          icon: detail.icon,
          iconUrl: detail.iconUrl
        });
      }
    }

    await this.createMissingMealDetails(restaurantId, drafts);
  }

  private async createMissingIngredients(
    restaurantId: string,
    drafts: Map<string, { adminName: string; displayName: string; imageUrl: string }>
  ) {
    const keys = Array.from(drafts.keys());
    if (!keys.length) return;

    const existing = await this.prisma.ingredientLibraryItem.findMany({
      where: { restaurantId, adminNameNormalized: { in: keys } },
      select: { adminNameNormalized: true }
    });
    const existingKeys = new Set(existing.map((item) => item.adminNameNormalized));

    await Promise.all(keys
      .filter((key) => !existingKeys.has(key))
      .map(async (key) => {
        const draft = drafts.get(key)!;
        try {
          await this.prisma.ingredientLibraryItem.create({
            data: {
              restaurantId,
              adminName: draft.adminName,
              adminNameNormalized: key,
              displayName: draft.displayName,
              imageUrl: this.cleanOptional(draft.imageUrl),
              isActive: true
            }
          });
        } catch (error) {
          if (!this.isUniqueError(error)) throw error;
        }
      }));
  }

  private async createMissingMealDetails(
    restaurantId: string,
    drafts: Map<string, { adminName: string; displayName: string; value: string; icon: string; iconUrl: string }>
  ) {
    const keys = Array.from(drafts.keys());
    if (!keys.length) return;

    const existing = await this.prisma.mealDetailLibraryItem.findMany({
      where: { restaurantId, adminNameNormalized: { in: keys } },
      select: { adminNameNormalized: true }
    });
    const existingKeys = new Set(existing.map((item) => item.adminNameNormalized));

    await Promise.all(keys
      .filter((key) => !existingKeys.has(key))
      .map(async (key) => {
        const draft = drafts.get(key)!;
        try {
          await this.prisma.mealDetailLibraryItem.create({
            data: {
              restaurantId,
              adminName: draft.adminName,
              adminNameNormalized: key,
              displayName: draft.displayName,
              value: this.cleanOptional(draft.value),
              icon: this.cleanOptional(draft.icon) ?? "utensils",
              iconUrl: this.cleanOptional(draft.iconUrl),
              isActive: true
            }
          });
        } catch (error) {
          if (!this.isUniqueError(error)) throw error;
        }
      }));
  }

  private normalizeLegacyIngredient(item: Prisma.JsonValue) {
    if (typeof item === "string") {
      const name = item.trim();
      return name ? { name, displayName: name, adminName: "", imageUrl: "" } : null;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, Prisma.JsonValue>;
    const displayName = this.scalarText(record.displayName);
    const adminName = this.scalarText(record.adminName);
    const name = this.scalarText(record.name) || displayName || this.scalarText(record.label) || this.scalarText(record.title) || this.scalarText(record.value);
    const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";

    return name || adminName ? { name: name || adminName, displayName: displayName || name || adminName, adminName, imageUrl } : null;
  }

  private normalizeLegacyMealDetails(nutrition: Prisma.JsonValue | null) {
    if (Array.isArray(nutrition)) {
      return nutrition
        .map((item) => this.normalizeLegacyMealDetailItem(item))
        .filter((item): item is { label: string; displayName: string; adminName: string; value: string; icon: string; iconUrl: string } => Boolean(item));
    }

    if (!nutrition || typeof nutrition !== "object") return [];

    const record = nutrition as Record<string, Prisma.JsonValue>;
    const details = this.legacyArray(record.details);
    const detailItems = details.length ? details : this.legacyArray(record.items);
    if (detailItems.length) {
      return detailItems
        .map((item) => this.normalizeLegacyMealDetailItem(item))
        .filter((item): item is { label: string; displayName: string; adminName: string; value: string; icon: string; iconUrl: string } => Boolean(item));
    }

    return [
      this.legacyMealDetail(record.weight, "الوزن التقريبي", "scale"),
      this.legacyMealDetail(record.protein, "نوع البروتين", "drumstick"),
      this.legacyMealDetail(record.breadType, "نوع الخبز", "wheat"),
      this.legacyMealDetail(record.spice, "مستوى الحدة", "flame")
    ].filter((item): item is { label: string; displayName: string; adminName: string; value: string; icon: string; iconUrl: string } => Boolean(item));
  }

  private normalizeLegacyMealDetailItem(item: Prisma.JsonValue) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, Prisma.JsonValue>;
    const displayName = this.scalarText(record.displayName);
    const adminName = this.scalarText(record.adminName);
    const label = this.scalarText(record.label) || displayName || this.scalarText(record.name) || this.scalarText(record.title);
    const value = this.scalarText(record.value) || this.scalarText(record.amount);
    const icon = typeof record.icon === "string" && record.icon.trim() ? record.icon.trim() : "utensils";
    const iconUrl = typeof record.iconUrl === "string" && record.iconUrl.trim()
      ? record.iconUrl.trim()
      : typeof record.imageUrl === "string" && record.imageUrl.trim()
        ? record.imageUrl.trim()
        : "";

    return label || value || adminName ? { label: label || adminName, displayName: displayName || label || adminName, adminName, value, icon, iconUrl } : null;
  }

  private legacyMealDetail(value: Prisma.JsonValue | undefined, label: string, icon: string) {
    const normalizedValue = this.scalarText(value);
    return normalizedValue ? { label, displayName: label, adminName: "", value: normalizedValue, icon, iconUrl: "" } : null;
  }

  private legacyArray(value: Prisma.JsonValue | undefined | null): Prisma.JsonValue[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];

    const record = value as Record<string, Prisma.JsonValue>;
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.values)) return record.values;
    return [];
  }

  private scalarText(value: Prisma.JsonValue | undefined | null) {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    return "";
  }

  private uniqueNames(names: string[]) {
    const seen = new Set<string>();
    return names
      .map((name) => name.trim())
      .filter((name) => {
        const normalized = this.normalizeAdminName(name);
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  private requiredName(value: string | undefined | null, message: string) {
    const cleaned = value?.trim() ?? "";
    if (!cleaned) {
      throw new BadRequestException(message);
    }
    return cleaned;
  }

  private cleanOptional(value: string | null | undefined) {
    const cleaned = value?.trim() ?? "";
    return cleaned || null;
  }

  private handleUniqueError(error: unknown, message: string) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException(message);
    }
  }

  private handleDatabaseError(error: unknown) {
    const maybeError = error as { code?: string; name?: string; message?: string };
    if (
      maybeError.code === "P1001" ||
      maybeError.name === "PrismaClientInitializationError" ||
      maybeError.message?.includes("Can't reach database server")
    ) {
      throw new ServiceUnavailableException("تعذر الاتصال بقاعدة البيانات. تحقق من اتصال Neon ثم أعد المحاولة.");
    }
  }

  private isUniqueError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
