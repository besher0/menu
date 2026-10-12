import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { MediaController } from "./media.controller";

function createController() {
  return new MediaController({} as any, {} as any, {} as any);
}

describe("MediaController global library permissions", () => {
  it("forbids restaurant dashboard writes to ingredient library items", () => {
    const controller = createController();

    expect(() => controller.createIngredient()).toThrow(ForbiddenException);
    expect(() => controller.updateIngredient()).toThrow(ForbiddenException);
    expect(() => controller.deleteIngredient()).toThrow(ForbiddenException);
  });

  it("forbids restaurant dashboard writes to meal detail library items", () => {
    const controller = createController();

    expect(() => controller.createMealDetail()).toThrow(ForbiddenException);
    expect(() => controller.updateMealDetail()).toThrow(ForbiddenException);
    expect(() => controller.deleteMealDetail()).toThrow(ForbiddenException);
  });
});
