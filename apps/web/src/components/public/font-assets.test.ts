import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const directory = "src/app/fonts/almarai";
const css = readFileSync(join(directory, "almarai.css"), "utf8");
const source = JSON.parse(readFileSync(join(directory, "sources.json"), "utf8")) as {
  entries: { file: string; weight: string; subset: string; bytes: number; sha256: string; unicodeRange: string }[];
};

describe("self-hosted Almarai preserves typography and offline build inputs", () => {
  it("contains precisely the existing four weights and two original glyph subsets", () => {
    expect(source.entries.map(e => `${e.weight}/${e.subset}`).sort()).toEqual(
      ["300", "400", "700", "800"].flatMap(w => [`${w}/arabic`, `${w}/latin`]).sort()
    );
    expect(readdirSync(directory).filter(name => name.endsWith(".woff2")).sort()).toEqual(source.entries.map(e => e.file).sort());
  });
  it.each(source.entries)("ships unmodified licensed binary $file", entry => {
    const bytes = readFileSync(join(directory, entry.file));
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("wOF2");
    expect(bytes.length).toBe(entry.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    const face = css.split("@font-face").find(block => block.includes(`./${entry.file}`));
    expect(face).toContain("font-family: 'Almarai'");
    expect(face).toContain(`font-weight: ${entry.weight};`);
    expect(face).toContain("font-style: normal;");
    expect(face).toContain("font-display: swap;");
    expect(face).toContain(`unicode-range: ${entry.unicodeRange};`);
  });
  it("uses build-local assets without external CSS or changed theme font names", () => {
    expect(css.match(/@font-face/g)).toHaveLength(8);
    expect(css).not.toMatch(/url\(https?:/);
    expect(css).not.toContain("size-adjust");
    const globalCss = readFileSync("src/app/globals.css", "utf8");
    expect(globalCss).toContain('@import "./fonts/almarai/almarai.css";');
    expect(globalCss).not.toContain("fonts.googleapis.com");
  });
  it("distributes the font copyright and license with public assets", () => {
    const license = readFileSync("public/fonts/almarai/OFL.txt", "utf8");
    expect(license).toContain("Copyright 2019 The Almarai Project Authors");
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
});
