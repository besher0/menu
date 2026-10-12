import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { extname, join, resolve } from "path";
import { readPositiveInt } from "../../common/security/env";

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
      cloudinary = await this.uploadToCloudinaryIfConfigured(await readFile(file.path), file.originalname, file.mimetype, type);
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }

    if (cloudinary) {
      await unlink(file.path).catch(() => undefined);
      return {
        url: cloudinary.secureUrl,
        provider: "CLOUDINARY",
        filename: file.filename,
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

    return {
      url: `${this.apiOrigin()}/uploads/${file.filename}`,
      provider: "LOCAL",
      filename: file.filename,
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
    const detected = await this.detectFileType(input.buffer);
    const mimeType = detected?.mime ?? input.mimeType ?? this.mimeFromFilename(input.originalFilename);
    const extension = `.${detected?.ext ?? extname(input.originalFilename).replace(/^\./, "")}`.toLowerCase();

    if (input.type === "IMAGE" && (!importImageExtensions.has(extension) || !importImageMimeTypes.has(mimeType))) {
      throw new BadRequestException("Unsupported Excel image type");
    }

    const filename = this.safeFilename(input.originalFilename, extension);
    const cloudinary = await this.uploadToCloudinaryIfConfigured(input.buffer, input.originalFilename, mimeType, input.type);

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

    if (input.type === "MODEL_3D") {
      throw new BadRequestException("Cloudinary is required for 3D uploads. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
    }

    await mkdir("uploads", { recursive: true });
    await writeFile(join("uploads", filename), input.buffer);

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
      await this.cleanupLocalUpload(upload.url).catch(() => undefined);
      return;
    }

    const publicId = typeof upload.metadata?.cloudinaryPublicId === "string" ? upload.metadata.cloudinaryPublicId : null;
    const resourceType = typeof upload.metadata?.cloudinaryResourceType === "string" ? upload.metadata.cloudinaryResourceType : "image";
    if (publicId) {
      await this.destroyCloudinary(publicId, resourceType).catch(() => undefined);
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

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = this.config.get<string>("CLOUDINARY_FOLDER") ?? "menu-builder";
    const resourceType = type === "IMAGE" || type === "SVG_ICON" || type === "PNG_ICON" ? "image" : "raw";
    const signature = createHash("sha1")
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");
    const formData = new FormData();

    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    formData.append("file", new Blob([arrayBuffer], { type: mimeType }), originalFilename);
    formData.append("api_key", apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("folder", folder);
    formData.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
      method: "POST",
      body: formData
    });
    const payload = await response.json().catch(() => null) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    } | null;

    if (!response.ok || !payload?.secure_url) {
      throw new BadRequestException(payload?.error?.message ?? "Cloudinary upload failed");
    }

    return { secureUrl: payload.secure_url, publicId: payload.public_id, resourceType };
  }

  private async destroyCloudinary(publicId: string, resourceType: string) {
    const cloudName = this.config.get<string>("CLOUDINARY_CLOUD_NAME");
    const apiKey = this.config.get<string>("CLOUDINARY_API_KEY");
    const apiSecret = this.config.get<string>("CLOUDINARY_API_SECRET");

    if (!cloudName || !apiKey || !apiSecret) {
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash("sha1")
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");
    const formData = new FormData();

    formData.append("public_id", publicId);
    formData.append("api_key", apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);

    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
      method: "POST",
      body: formData
    });
  }

  private async cleanupLocalUpload(url: string) {
    const pathname = this.uploadPathname(url);
    if (!pathname) return;

    const uploadsRoot = resolve("uploads");
    const target = resolve(uploadsRoot, pathname.replace(/^\/?uploads[\\/]/, ""));
    if (!target.startsWith(uploadsRoot)) return;

    await unlink(target);
  }

  private uploadPathname(url: string) {
    if (url.startsWith("/uploads/")) return url;

    try {
      const parsed = new URL(url);
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
    return `${Date.now()}-${randomUUID()}-${safeBase || "asset"}${extension}`;
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
