import { describe, expect, it } from "vitest";
import { findDependencyCycle } from "./product-configuration.persistence";

describe("product configuration persistence preparation", () => {
  it("detects a linked-product cycle", () => {
    expect(findDependencyCycle([
      { productId: "a", sourceProductId: "b" },
      { productId: "b", sourceProductId: "c" },
      { productId: "c", sourceProductId: "a" }
    ])).toEqual(["a", "b", "c", "a"]);
  });

  it("accepts an acyclic dependency graph", () => {
    expect(findDependencyCycle([
      { productId: "a", sourceProductId: "b" },
      { productId: "a", sourceProductId: "c" },
      { productId: "b", sourceProductId: "c" }
    ])).toBeNull();
  });
});
