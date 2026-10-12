import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const seedSource = readFileSync(new URL("./seed.ts", import.meta.url), "utf8");

describe("demo seed persistence safety", () => {
  it("does not delete existing menu builder sections before creating defaults", () => {
    expect(seedSource).not.toContain("menuSection.deleteMany({ where: { pageId: homePage.id } })");
    expect(seedSource).toContain("const existingSectionCount = await prisma.menuSection.count");
    expect(seedSource).toContain("if (existingSectionCount === 0)");
  });

  it("does not overwrite restaurant theme settings for an existing restaurant", () => {
    expect(seedSource).toMatch(/update:\s*\{\s*themeId:\s*theme\.id\s*\}/);
  });
});
