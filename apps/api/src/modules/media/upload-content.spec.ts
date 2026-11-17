import { describe, expect, it } from "vitest";
import { validateSvg, validateModel } from "./upload-content";

const icon = (element: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${element}</svg>`);
const model = (fields: object) => Buffer.from(JSON.stringify({asset:{version:"2.0"}, ...fields}));

describe("media intake policy", () => {
  it("accepts a geometric SVG and its accessible title", () => {
    expect(() => validateSvg(icon('<title>طبق</title><path fill="#333" d="M1 2L3 4Z"/>'))).not.toThrow();
  });
  it.each(["<foreignObject/>", '<image href="https://example.invalid/logo.png"/>', '<rect style="fill:red"/>'])("refuses a non-geometric feature %s", content => {
    expect(() => validateSvg(icon(content))).toThrow();
  });
  it("rejects oversized SVG before parsing", () => expect(() => validateSvg(Buffer.alloc(256*1024+1))).toThrow());
  it("accepts a self-contained glTF scene", async () => {
    await expect(validateModel(model({scenes:[{}],scene:0}),".gltf")).resolves.toBeUndefined();
  });
  it("rejects a glTF referencing another asset", async () => {
    await expect(validateModel(model({buffers:[{byteLength:4,uri:"textures/wood.bin"}]}),".gltf")).rejects.toMatchObject({status:400});
  });
  it("refuses unknown extension capabilities", async () => {
    await expect(validateModel(model({extensionsUsed:["unreviewed"]}),".gltf")).rejects.toMatchObject({status:400});
  });
  it("rejects an incorrect GLB container and unreviewed USDZ uploads", async () => {
    await expect(validateModel(model({}),".glb")).rejects.toMatchObject({status:400});
    await expect(validateModel(Buffer.from("synthetic"),".usdz")).rejects.toMatchObject({status:400});
  });
});
