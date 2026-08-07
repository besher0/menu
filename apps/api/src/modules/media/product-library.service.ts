import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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

  async listIngredients(restaurantId: string) {
    const data = await this.prisma.ingredientLibraryItem.findMany({
      where: { restaurantId },
      orderBy: [{ isActive: "desc" }, { adminName: "asc" }]
    });

    return { data };
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
      this.handleUniqueError(error, "Ingredient admin name already exists");
      throw error;
    }
  }

  async updateIngredient(restaurantId: string, id: string, dto: UpsertIngredientLibraryItemDto) {
    await this.findIngredient(restaurantId, id);
    const adminName = dto.adminName !== undefined ? this.requiredName(dto.adminName, "Admin name is required") : undefined;
    const displayName = dto.displayName !== undefined ? this.requiredName(dto.displayName, "Display name is required") : undefined;

    try {
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
      this.handleUniqueError(error, "Ingredient admin name already exists");
      throw error;
    }
  }

  async deleteIngredient(restaurantId: string, id: string) {
    await this.findIngredient(restaurantId, id);
    await this.prisma.ingredientLibraryItem.update({
      where: { id },
      data: { isActive: false }
    });
    return { deleted: true };
  }

  async listMealDetails(restaurantId: string) {
    const data = await this.prisma.mealDetailLibraryItem.findMany({
      where: { restaurantId },
      orderBy: [{ isActive: "desc" }, { adminName: "asc" }]
    });

    return { data };
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
      this.handleUniqueError(error, "Meal detail admin name already exists");
      throw error;
    }
  }

  async updateMealDetail(restaurantId: string, id: string, dto: UpsertMealDetailLibraryItemDto) {
    await this.findMealDetail(restaurantId, id);
    const adminName = dto.adminName !== undefined ? this.requiredName(dto.adminName, "Admin name is required") : undefined;
    const displayName = dto.displayName !== undefined ? this.requiredName(dto.displayName, "Display name is required") : undefined;

    try {
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
      this.handleUniqueError(error, "Meal detail admin name already exists");
      throw error;
    }
  }

  async deleteMealDetail(restaurantId: string, id: string) {
    await this.findMealDetail(restaurantId, id);
    await this.prisma.mealDetailLibraryItem.update({
      where: { id },
      data: { isActive: false }
    });
    return { deleted: true };
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
}
