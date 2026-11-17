import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { ConfigService } from "@nestjs/config";
import { getUploadsDirectory } from "./uploads-directory";
import { MediaStorageService } from "../modules/media/media-storage.service";

function fixtureGlb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scenes: [{}], scene: 0 }));
  const padded = Math.ceil(json.length / 4) * 4;
  const glb = Buffer.alloc(20 + padded, 32);
  glb.write("glTF"); glb.writeUInt32LE(2,4); glb.writeUInt32LE(glb.length,8);
  glb.writeUInt32LE(padded,12); glb.write("JSON",16); json.copy(glb,20);
  return glb;
}
let temporary: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  temporary = undefined;
});

describe("Demo upload directory", () => {
  it("preserves the legacy location when no override is configured", () => {
    vi.stubEnv("ORDERSAWA_DEMO_UPLOADS_DIR", "");
    expect(getUploadsDirectory()).toBe(resolve("uploads"));
  });

  it("writes and cleans up uploads in the configured mutable directory", async () => {
    temporary = await mkdtemp(join(tmpdir(), "ordersawa-upload-test-"));
    const uploads = join(temporary, "uploads");
    vi.stubEnv("ORDERSAWA_DEMO_UPLOADS_DIR", uploads);
    expect(getUploadsDirectory()).toBe(uploads);
    const service = new MediaStorageService({ get: () => undefined } as unknown as ConfigService);
    vi.spyOn(service as any, "detectFileType").mockResolvedValue({ ext: "png", mime: "image/png" });
    const buffer = Buffer.from("disposable upload test");
    const upload = await service.storeBuffer({ buffer, originalFilename: "sample.png", type: "IMAGE" });
    expect(await readFile(join(uploads, upload.filename!))).toEqual(buffer);
    await service.cleanupStoredUpload(upload);
    await expect(readFile(join(uploads, upload.filename!))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes an unrecognized staged raster without publishing a file", async () => {
    temporary = await mkdtemp(join(tmpdir(), "image-validation-"));
    vi.stubEnv("ORDERSAWA_DEMO_UPLOADS_DIR", temporary);
    const staged = join(temporary, ".pending-fixture");
    await writeFile(staged, Buffer.from("plain fixture text"));
    const service = new MediaStorageService({get: () => undefined} as unknown as ConfigService);
    await expect(service.storeUploadedFile({path:staged, originalname:"sample.png", mimetype:"image/png"} as Express.Multer.File))
      .rejects.toMatchObject({status:400});
    await expect(readFile(staged)).rejects.toMatchObject({code:"ENOENT"});
  });

  it("requires the 3D provider even when the client omits the type or claims IMAGE", async () => {
    temporary = await mkdtemp(join(tmpdir(), "model-provider-test-"));
    vi.stubEnv("ORDERSAWA_DEMO_UPLOADS_DIR", temporary);
    const service = new MediaStorageService({ get: () => undefined } as unknown as ConfigService);
    for (const type of [undefined, "IMAGE"] as const) {
      const staged = join(temporary, "pending");
      await writeFile(staged, fixtureGlb());
      const file = { path: staged, originalname: "sample.GLB", mimetype: "model/gltf-binary" } as Express.Multer.File;
      await expect(service.storeUploadedFile(file, type)).rejects.toMatchObject({ status: 400 });
      await expect(readFile(staged)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("uses the raw model endpoint and never returns Cloudinary error details", async () => {
    temporary = await mkdtemp(join(tmpdir(), "model-provider-test-"));
    const service = new MediaStorageService({ get: () => "fixture" } as unknown as ConfigService);
    const remote = vi.spyOn(globalThis, "fetch");
    const file = { path: join(temporary, "staged"), originalname: "sample.glb", mimetype: "model/gltf-binary" } as Express.Multer.File;
    await writeFile(file.path, fixtureGlb());
    remote.mockResolvedValueOnce(Response.json({ secure_url: "https://res.cloudinary.com/fixture/raw/upload/v1/model.glb", public_id: "fixture" }));
    expect((await service.storeUploadedFile(file)).provider).toBe("CLOUDINARY");
    expect(remote).toHaveBeenCalledWith(expect.stringContaining("/raw/upload"), expect.objectContaining({ redirect: "error" }));
    await writeFile(file.path, fixtureGlb());
    remote.mockResolvedValueOnce(Response.json({ error: { message: "private provider diagnostic" } }, { status: 400 }));
    await expect(service.storeUploadedFile(file)).rejects.toMatchObject({ message: "Cloudinary upload failed" });
    await expect(readFile(file.path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never cleans up a sibling directory with the same prefix", async () => {
    temporary = await mkdtemp(join(tmpdir(), "ordersawa-upload-test-"));
    vi.stubEnv("ORDERSAWA_DEMO_UPLOADS_DIR", join(temporary, "uploads"));
    const sibling = join(temporary, "uploads-other.txt");
    await writeFile(sibling, "preserve");
    const service = new MediaStorageService({ get: () => undefined } as unknown as ConfigService);
    await service.cleanupStoredUpload({ provider: "LOCAL", url: "/uploads/../uploads-other.txt" });
    expect(await readFile(sibling, "utf8")).toBe("preserve");
  });
});
