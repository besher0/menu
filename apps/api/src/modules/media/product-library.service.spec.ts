import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ProductLibraryService } from "./product-library.service";

function createService(prisma: Record<string, any>) {
  return new ProductLibraryService(prisma as any);
}

describe("ProductLibraryService global library", () => {
  it("lists only active ingredients for restaurant-facing reads", async () => {
    const prisma = {
      ingredientLibraryItem: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };
    const service = createService(prisma);

    await service.listIngredients();

    expect(prisma.ingredientLibraryItem.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ isActive: "desc" }, { adminName: "asc" }]
    });
  });

  it("allows super admin reads to include inactive ingredients", async () => {
    const prisma = {
      ingredientLibraryItem: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };
    const service = createService(prisma);

    await service.listIngredients({ includeInactive: true });

    expect(prisma.ingredientLibraryItem.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: [{ isActive: "desc" }, { adminName: "asc" }]
    });
  });

  it("creates an ingredient without restaurant ownership", async () => {
    const prisma = {
      ingredientLibraryItem: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    const service = createService(prisma);

    await service.createIngredient({ adminName: "Cheese", displayName: "جبنة", imageUrl: "" });

    expect(prisma.ingredientLibraryItem.create).toHaveBeenCalledWith({
      data: {
        adminName: "Cheese",
        adminNameNormalized: "cheese",
        displayName: "جبنة",
        imageUrl: null,
        isActive: true
      }
    });
  });

  it("maps duplicate global admin names to conflict errors", async () => {
    const prisma = {
      ingredientLibraryItem: {
        create: vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique", {
          code: "P2002",
          clientVersion: "test"
        }))
      }
    };
    const service = createService(prisma);

    await expect(service.createIngredient({ adminName: "Cheese", displayName: "Cheese" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("resolves ingredient snapshots from the global active library", async () => {
    const prisma = {
      ingredientLibraryItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: "ingredient-1", adminName: "Cheese", adminNameNormalized: "cheese", displayName: "جبنة", imageUrl: "/cheese.png" }
        ])
      }
    };
    const service = createService(prisma);

    const result = await service.resolveIngredientSnapshots(["Cheese", "Tomato"]);

    expect(prisma.ingredientLibraryItem.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        adminNameNormalized: { in: ["cheese", "tomato"] }
      }
    });
    expect(result.snapshots).toEqual([
      { libraryId: "ingredient-1", adminName: "Cheese", displayName: "جبنة", name: "جبنة", imageUrl: "/cheese.png" }
    ]);
    expect(result.unknown).toEqual(["Tomato"]);
  });

  it("soft deletes meal details globally by id only", async () => {
    const prisma = {
      mealDetailLibraryItem: {
        findUnique: vi.fn().mockResolvedValue({ id: "detail-1" }),
        update: vi.fn().mockResolvedValue({})
      }
    };
    const service = createService(prisma);

    await service.deleteMealDetail("detail-1");

    expect(prisma.mealDetailLibraryItem.findUnique).toHaveBeenCalledWith({ where: { id: "detail-1" } });
    expect(prisma.mealDetailLibraryItem.update).toHaveBeenCalledWith({
      where: { id: "detail-1" },
      data: { isActive: false }
    });
  });

  it("returns not found when deleting a missing global ingredient", async () => {
    const prisma = {
      ingredientLibraryItem: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn()
      }
    };
    const service = createService(prisma);

    await expect(service.deleteIngredient("missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.ingredientLibraryItem.update).not.toHaveBeenCalled();
  });
});
