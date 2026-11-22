import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import { validateSvg, validateModel } from "./upload-content";
import { mkdir, stat, readFile, rename, unlink, writeFile } from "fs/promises";
import { extname, join, resolve, sep } from "path";
import { readPositiveInt } from "../../common/security/env";
import { getUploadsDirectory } from "../../common/uploads-directory";

const modelExtensions = new Set([".glb", ".gltf", ".usdz"]);

type UploadKind = "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON";

function storageKind(filename: string, requested?: UploadKind): UploadKind | undefined {
  const ext = extname(filename).toLowerCase();
  const model = modelExtensions.has(ext);
  if (requested !== undefined && !["IMAGE","PNG_ICON","SVG_ICON","MODEL_3D","VR_PANORAMA"].includes(requested)) {
    throw new BadRequestException("Unknown upload type");
  }
  if (ext === ".svg" && requested && requested !== "SVG_ICON" && requested !== "IMAGE" ||
      requested === "SVG_ICON" && ext !== ".svg" || requested === "PNG_ICON" && ext !== ".png") {
    throw new BadRequestException("Image type and file extension must agree");
  }
  if (requested !== undefined && (requested === "MODEL_3D") !== model) {
    throw new BadRequestException("Model type and file extension must agree");
  }
  return model ? "MODEL_3D" : ext === ".svg" ? "SVG_ICON" : requested;
}

export const uploadMaxBytes = readPositiveInt("MAX_UPLOAD_MB", 75) * 1024 * 1024;
export const allowedUploadExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".glb", ".gltf", ".usdz"]);
export const allowedUploadMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "model/gltf-binary",
  "model/gltf+json",
  "model/vnd.usdz+zip",
  "application/octet-stream",
  "application/zip"
]);

export const importImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const importImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type StoredUpload = {
  url: string;
  provider: "LOCAL" | "CLOUDINARY";
  filename?: string;
  originalFilename?: string;
  mimeType?: string;
  size?: number;
  metadata?: Record<string, unknown>;
};

export function validateUploadFile(file: Pick<Express.Multer.File, "originalname" | "mimetype">) {
  const extension = extname(file.originalname).toLowerCase();

  if (!allowedUploadExtensions.has(extension) || !allowedUploadMimeTypes.has(file.mimetype)) {
    throw new BadRequestException("Unsupported upload type");
  }
}

@Injectable()
export class MediaStorageService {
  private readonly log = new Logger(MediaStorageService.name);

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  validateUpload(file: Pick<Express.Multer.File, "originalname" | "mimetype">) {
    validateUploadFile(file);
  }

  async storeUploadedFile(
    file: Express.Multer.File,
    type?: "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON"
  ): Promise<StoredUpload> {
    let cloudinary: Awaited<ReturnType<MediaStorageService["uploadToCloudinaryIfConfigured"]>>;
    try {
      type = storageKind(file.originalname, type);
      validateUploadFile(file);
      const ext = extname(file.originalname).toLowerCase();
      const limit = ext === ".svg" ? 256 * 1024 : modelExtensions.has(ext) ? 12 * 1024 * 1024 : uploadMaxBytes;
      if ((await stat(file.path)).size > limit) throw new BadRequestException("File exceeds allowed size");
      const bytes = await readFile(file.path);
      if (ext === ".svg") {
        if (file.mimetype !== "image/svg+xml" && file.mimetype !== "application/octet-stream") throw new BadRequestException("Invalid SVG MIME type");
        validateSvg(bytes);
      }
      if (modelExtensions.has(ext)) {
        const expected = ext === ".glb" ? "model/gltf-binary" : "model/gltf+json";
        if (file.mimetype !== expected && file.mimetype !== "application/octet-stream") throw new BadRequestException("Invalid model MIME type");
        await validateModel(bytes,ext);
      }
      if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
        const expected = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/" + ext.slice(1);
        const detected = await this.detectFileType(bytes).catch(() => undefined);
        if (detected?.mime !== expected || (file.mimetype !== expected && file.mimetype !== "application/octet-stream")) {
          throw new BadRequestException("Image content does not match its file type");
        }
      }
      cloudinary = await this.uploadToCloudinaryIfConfigured(bytes, file.originalname, file.mimetype, type);
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }

    if (cloudinary) {
      await unlink(file.path).catch(() => undefined);
      return {
        url: cloudinary.secureUrl,
        provider: "CLOUDINARY",
        filename: this.safeFilename(file.originalname, extname(file.originalname).toLowerCase()),
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        metadata: { cloudinaryPublicId: cloudinary.publicId, cloudinaryResourceType: cloudinary.resourceType }
      };
    }

    if (type === "MODEL_3D") {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException("Cloudinary is required for 3D uploads. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
    }

    const filename = this.safeFilename(file.originalname, extname(file.originalname).toLowerCase());
    try {
      await rename(file.path, join(getUploadsDirectory(), filename));
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
    return {
      url: `${this.apiOrigin()}/uploads/${filename}`,
      provider: "LOCAL",
      filename,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    };
  }

  async storeBuffer(input: {
    buffer: Buffer;
    originalFilename: string;
    mimeType?: string;
    type?: "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON";
  }): Promise<StoredUpload> {
    // Buffer input is the workbook raster-import boundary. Interactive uploads use storeUploadedFile.
    if (input.type !== "IMAGE" || input.buffer.length > uploadMaxBytes) throw new BadRequestException("Expected a bounded workbook image");
    const type = storageKind(input.originalFilename, input.type);
    const detected = await this.detectFileType(input.buffer);
    const mimeType = detected?.mime ?? input.mimeType ?? this.mimeFromFilename(input.originalFilename);
    const extension = `.${detected?.ext ?? extname(input.originalFilename).replace(/^\./, "")}`.toLowerCase();

    if (!detected || !importImageExtensions.has(extension) || !importImageMimeTypes.has(mimeType) || input.mimeType && input.mimeType !== mimeType) {
      throw new BadRequestException("Unsupported Excel image type");
    }

    const filename = this.safeFilename(input.originalFilename, extension);
    const cloudinary = await this.uploadToCloudinaryIfConfigured(input.buffer, input.originalFilename, mimeType, type);

    if (cloudinary) {
      return {
        url: cloudinary.secureUrl,
        provider: "CLOUDINARY",
        filename,
        originalFilename: input.originalFilename,
        mimeType,
        size: input.buffer.length,
        metadata: { cloudinaryPublicId: cloudinary.publicId, cloudinaryResourceType: cloudinary.resourceType }
      };
    }

    if (type === "MODEL_3D") {
      throw new BadRequestException("Cloudinary is required for 3D uploads. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
    }

    const uploadsRoot = getUploadsDirectory();
    await mkdir(uploadsRoot, { recursive: true });
    await writeFile(join(uploadsRoot, filename), input.buffer);

    return {
      url: `${this.apiOrigin()}/uploads/${filename}`,
      provider: "LOCAL",
      filename,
      originalFilename: input.originalFilename,
      mimeType,
      size: input.buffer.length
    };
  }

  async cleanupStoredUpload(upload: StoredUpload) {
    if (upload.provider === "LOCAL") {
      await this.cleanupLocalUpload(upload.url).catch(() => this.log.warn("Local media cleanup did not complete"));
      return;
    }

    const publicId = typeof upload.metadata?.cloudinaryPublicId === "string" ? upload.metadata.cloudinaryPublicId : null;
    const resourceType = typeof upload.metadata?.cloudinaryResourceType === "string" ? upload.metadata.cloudinaryResourceType : "image";
    if (publicId) {
      await this.destroyCloudinary(publicId, resourceType).catch(() => this.log.warn("Cloud media cleanup did not complete"));
    }
  }

  private async detectFileType(buffer: Buffer) {
    const dynamicImport = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;
    const module = await dynamicImport<typeof import("file-type")>("file-type");
    return module.fileTypeFromBuffer(buffer);
  }

  private async uploadToCloudinaryIfConfigured(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    type?: "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON"
  ) {
    const cloudName = this.config.get<string>("CLOUDINARY_CLOUD_NAME");
    const apiKey = this.config.get<string>("CLOUDINARY_API_KEY");
    const apiSecret = this.config.get<string>("CLOUDINARY_API_SECRET");

    if (!cloudName || !apiKey || !apiSecret) {
      return null;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) throw new BadRequestException("Invalid media provider configuration");
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = this.config.get<string>("CLOUDINARY_FOLDER") ?? "menu-builder";
    const resourceType = type === "IMAGE" || type === "SVG_ICON" || type === "PNG_ICON" ? "image" : "raw";
    const publicId = randomUUID() + (resourceType === "raw" ? extname(originalFilename).toLowerCase() : "");
    const signature = createHash("sha1")
      .update(`folder=${folder}&overwrite=false&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");
    const formData = new FormData();

    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    formData.append("file", new Blob([arrayBuffer], { type: mimeType }), originalFilename);
    formData.append("api_key", apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("folder", folder);
    formData.append("overwrite", "false");
    formData.append("public_id", publicId);
    formData.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      body: formData
    });
    const payload = await response.json().catch(() => null) as {
      secure_url?: string;
      public_id?: string;
    } | null;

    if (!response.ok || !payload?.secure_url) {
      throw new BadRequestException("Cloudinary upload failed");
    }

    let location: URL;
    try { location = new URL(payload.secure_url); } catch { throw new BadRequestException("Invalid media provider response"); }
    if (location.origin !== "https://res.cloudinary.com" || location.username || location.password ||
        !location.pathname.startsWith(`/${cloudName}/${resourceType}/upload/`) || !payload.public_id) {
      throw new BadRequestException("Invalid media provider response");
    }
    return { secureUrl: location.href, publicId: payload.public_id, resourceType };
  }

  private async destroyCloudinary(publicId: string, resourceType: string) {
    const cloudName = this.config.get<string>("CLOUDINARY_CLOUD_NAME");
    const apiKey = this.config.get<string>("CLOUDINARY_API_KEY");
    const apiSecret = this.config.get<string>("CLOUDINARY_API_SECRET");

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Media provider unavailable");
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) throw new BadRequestException("Invalid media provider configuration");
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash("sha1")
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");
    const formData = new FormData();

    formData.append("public_id", publicId);
    formData.append("api_key", apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      body: formData
    });
    if (!response.ok) throw new Error("Media cleanup rejected");
  }

  private async cleanupLocalUpload(url: string) {
    const pathname = this.uploadPathname(url);
    if (!pathname) return;

    const uploadsRoot = getUploadsDirectory();
    const target = resolve(uploadsRoot, pathname.replace(/^\/?uploads[\\/]/, ""));
    if (!target.startsWith(uploadsRoot + sep)) return;

    await unlink(target);
  }

  private uploadPathname(url: string) {
    if (url.startsWith("/uploads/")) return url;

    try {
      const parsed = new URL(url);
      const api = new URL(this.apiOrigin());
      const prefix = api.pathname.replace(/\/$/, "") + "/uploads/";
      if (parsed.origin !== api.origin) return null;
      if (parsed.pathname.startsWith(prefix)) return "/uploads/" + parsed.pathname.slice(prefix.length);
      return parsed.pathname.startsWith("/uploads/") ? parsed.pathname : null;
    } catch {
      return null;
    }
  }

  private safeFilename(originalFilename: string, extension: string) {
    const safeBase = originalFilename
      .replace(extname(originalFilename), "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return `${extension === ".svg" ? "verified-svg-" : ""}${Date.now()}-${randomUUID()}-${safeBase || "asset"}${extension}`;
  }

  private mimeFromFilename(filename: string) {
    const extension = extname(filename).toLowerCase();
    if (extension === ".png") return "image/png";
    if (extension === ".webp") return "image/webp";
    if (extension === ".svg") return "image/svg+xml";
    return "image/jpeg";
  }

  private apiOrigin() {
    return this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5000}`;
  }
}
