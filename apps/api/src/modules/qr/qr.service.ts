import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { toString } from "qrcode";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateQrCodeDto } from "./dto/create-qr-code.dto";

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
        label: dto.label,
        targetUrl: this.normalizeTarget(dto.targetUrl, restaurantSlug)
      },
      include: { branch: true }
    });

    return this.serialize(code);
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
      return `${this.webOrigin()}${targetUrl}`;
    }

    if (targetUrl === "main-menu") {
      return this.publicMenuUrl(restaurantSlug);
    }

    return targetUrl;
  }

  private publicMenuUrl(restaurantSlug: string) {
    return `${this.webOrigin()}/m/${restaurantSlug}`;
  }

  private publicQrUrl(id: string) {
    return `${this.apiOrigin()}/q/${id}`;
  }

  private apiOrigin() {
    return this.config.get<string>("API_ORIGIN") ?? `http://localhost:${this.config.get<string>("PORT") ?? 4000}`;
  }

  private webOrigin() {
    return this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
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
