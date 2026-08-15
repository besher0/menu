import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { toString } from "qrcode";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateQrCodeDto } from "./dto/create-qr-code.dto";
import { UpdateQrCodeDto } from "./dto/update-qr-code.dto";

@Injectable()
export class QrService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async list(restaurantId: string, restaurantSlug: string) {
    await this.featureFlags.assertFeature(restaurantId, "QR_CODES");
    await this.ensureDefaultCodes(restaurantId, restaurantSlug);

    const codes = await this.prisma.qrCode.findMany({
      where: { restaurantId },
      include: { branch: true },
      orderBy: { createdAt: "asc" }
    });

    return Promise.all(codes.map((code) => this.serialize(code)));
  }

  async create(restaurantId: string, restaurantSlug: string, dto: CreateQrCodeDto) {
    await this.featureFlags.assertFeature(restaurantId, "QR_CODES");

    const label = dto.label.trim();
    if (!label) {
      throw new BadRequestException("QR label is required");
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, restaurantId, deletedAt: null }
      });

      if (!branch) {
        throw new BadRequestException("Branch does not belong to this restaurant");
      }
    }

    const code = await this.prisma.qrCode.create({
      data: {
        restaurantId,
        branchId: dto.branchId,
        label,
        targetUrl: this.normalizeTarget(this.validateTarget(dto.targetUrl), restaurantSlug)
      },
      include: { branch: true }
    });

    return this.serialize(code);
  }

  async update(restaurantId: string, restaurantSlug: string, id: string, dto: UpdateQrCodeDto) {
    await this.featureFlags.assertFeature(restaurantId, "QR_CODES");

    const code = await this.prisma.qrCode.findFirst({
      where: { id, restaurantId },
      include: { branch: true }
    });

    if (!code) {
      throw new NotFoundException("QR code not found");
    }

    const data: {
      label?: string;
      targetUrl?: string;
      branchId?: string | null;
    } = {};

    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (!label) {
        throw new BadRequestException("QR label is required");
      }

      data.label = label;
    }

    if (dto.targetUrl !== undefined) {
      data.targetUrl = this.normalizeTarget(this.validateTarget(dto.targetUrl), restaurantSlug);
    }

    if (dto.branchId !== undefined) {
      if (dto.branchId === null) {
        data.branchId = null;
      } else {
        const branchId = dto.branchId.trim();
        if (!branchId) {
          throw new BadRequestException("Branch id is required");
        }

        const branch = await this.prisma.branch.findFirst({
          where: { id: branchId, restaurantId, deletedAt: null }
        });

        if (!branch) {
          throw new BadRequestException("Branch does not belong to this restaurant");
        }

        data.branchId = branchId;
      }
    }

    if (Object.keys(data).length === 0) {
      return this.serialize(code);
    }

    const updated = await this.prisma.qrCode.update({
      where: { id: code.id },
      data,
      include: { branch: true }
    });

    return this.serialize(updated);
  }

  async svgForDashboard(restaurantId: string, id: string) {
    await this.featureFlags.assertFeature(restaurantId, "QR_CODES");

    const code = await this.prisma.qrCode.findFirst({
      where: { id, restaurantId }
    });

    if (!code) {
      throw new NotFoundException("QR code not found");
    }

    return {
      id: code.id,
      svg: await this.generateSvg(this.publicQrUrl(code.id))
    };
  }

  async trackAndResolve(id: string, userAgent?: string) {
    const code = await this.prisma.qrCode.findUnique({
      where: { id },
      include: { branch: true, restaurant: true }
    });

    if (!code || !code.restaurant.isActive || code.restaurant.deletedAt) {
      throw new NotFoundException("QR code not found");
    }

    await this.prisma.analyticsEvent.create({
      data: {
        restaurantId: code.restaurantId,
        branchId: code.branchId,
        type: "QR_OPENED",
        path: code.targetUrl,
        userAgent,
        metadata: {
          qrCodeId: code.id,
          label: code.label
        }
      }
    });

    return code.targetUrl;
  }

  private async ensureDefaultCodes(restaurantId: string, restaurantSlug: string) {
    const existing = await this.prisma.qrCode.count({ where: { restaurantId } });
    if (existing > 0) {
      return;
    }

    const branches = await this.prisma.branch.findMany({
      where: { restaurantId, isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" }
    });

    await this.prisma.qrCode.create({
      data: {
        restaurantId,
        label: "Main menu",
        targetUrl: this.publicMenuUrl(restaurantSlug)
      }
    });

    await Promise.all(
      branches.map((branch) =>
        this.prisma.qrCode.create({
          data: {
            restaurantId,
            branchId: branch.id,
            label: `${branch.name} branch`,
            targetUrl: `${this.publicMenuUrl(restaurantSlug)}?branch=${encodeURIComponent(branch.slug)}`
          }
        })
      )
    );
  }

  private async serialize(code: {
    id: string;
    label: string;
    targetUrl: string;
    branchId: string | null;
    createdAt: Date;
    branch?: { id: string; slug: string; name: string } | null;
  }) {
    const qrUrl = this.publicQrUrl(code.id);

    return {
      id: code.id,
      label: code.label,
      targetUrl: code.targetUrl,
      qrUrl,
      branch: code.branch
        ? {
            id: code.branch.id,
            slug: code.branch.slug,
            name: code.branch.name
          }
        : null,
      svg: await this.generateSvg(qrUrl),
      createdAt: code.createdAt
    };
  }

  private normalizeTarget(targetUrl: string, restaurantSlug: string) {
    if (targetUrl.startsWith("/")) {
      return `${this.publicMenuUrl(restaurantSlug)}${targetUrl === "/" ? "" : targetUrl}`;
    }

    if (targetUrl === "main-menu") {
      return this.publicMenuUrl(restaurantSlug);
    }

    return targetUrl;
  }

  private validateTarget(targetUrl: string) {
    const value = targetUrl.trim();

    if (!value) {
      throw new BadRequestException("Target URL is required");
    }

    if (value === "main-menu") {
      return value;
    }

    if (value.startsWith("/")) {
      if (value.startsWith("//") || /\s/.test(value)) {
        throw new BadRequestException("Target URL is invalid");
      }

      return value;
    }

    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
        throw new Error("Invalid URL");
      }

      return value;
    } catch {
      throw new BadRequestException("Target URL is invalid");
    }
  }

  private publicMenuUrl(restaurantSlug: string) {
    const domain = this.rootDomain() ?? "ordersawa.com";
    return `https://${restaurantSlug}.${domain}`;
  }

  private publicQrUrl(id: string) {
    return `${this.apiOrigin()}/q/${id}`;
  }

  private apiOrigin() {
    return this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 5000}`;
  }

  private webOrigin() {
    return this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
  }

  private rootDomain() {
    return this.normalizeDomain(
      this.config.get<string>("ROOT_DOMAIN") ?? this.config.get<string>("NEXT_PUBLIC_ROOT_DOMAIN") ?? "ordersawa.com"
    );
  }

  private normalizeDomain(value?: string | null) {
    return value
      ?.trim()
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      ?.split(":")[0]
      ?.replace(/\.$/, "")
      .toLowerCase() || null;
  }

  private generateSvg(value: string) {
    return toString(value, {
      type: "svg",
      margin: 1,
      width: 320,
      color: {
        dark: "#151515",
        light: "#ffffff"
      }
    });
  }
}
