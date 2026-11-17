import {
  GoneException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { validateConfigurationV2, type ProductConfigurationV2 } from "@menu/shared";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProductConfigurationDto } from "./dto/update-product-configuration.dto";
import { isUnpricedNetworkSetup } from "./network-setup-configuration";

@Injectable()
export class ProductConfigurationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeatureFlagsService) private readonly featureFlags: FeatureFlagsService
  ) {}

  async get(restaurantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, restaurantId, deletedAt: null },
      select: {
        id: true,
        basePrice: true,
        configurationTree: true,
        configurationVersion: true,
        isAvailable: true
      }
    });

    if (!product) throw new NotFoundException("Product not found");

    const capabilityAssigned = await this.featureFlags.canUseAssignedFeature(
      restaurantId,
      "PRODUCT_CONFIGURATION"
    );
    const mode = product.configurationTree !== null && product.configurationVersion > 0 ? "NETWORK" : "LEGACY";

    return {
      productId: product.id,
      mode,
      configurationVersion: product.configurationVersion,
      configurationTree: product.configurationTree,
      basePrice: product.basePrice?.toString() ?? null,
      isAvailable: product.isAvailable,
      capability: {
        key: "PRODUCT_CONFIGURATION",
        assigned: capabilityAssigned,
        canRead: true,
        canWrite: capabilityAssigned
      },
      orderabilityState:
        mode === "LEGACY"
          ? "LEGACY"
          : !capabilityAssigned
            ? "ACTION_REQUIRED_CAPABILITY"
            : isUnpricedNetworkSetup(product.configurationTree)
              ? "SETUP_INCOMPLETE"
              : validateConfigurationV2(product.configurationTree as unknown as ProductConfigurationV2).length ? "INVALID_CONFIGURATION" : "CONFIGURED_V2"
    };
  }

  /** Standalone writes cannot satisfy the Unified Editor product/configuration CAS contract. */
  async save(restaurantId: string, productId: string, _dto: UpdateProductConfigurationDto): Promise<never> {
    await this.featureFlags.assertAssignedFeature(restaurantId, "PRODUCT_CONFIGURATION");
    const owner = await this.prisma.product.findFirst({
      where: { id: productId, restaurantId, deletedAt: null }, select: { id: true }
    });
    if (!owner) throw new NotFoundException("Product not found");
    throw new GoneException({ error: "UNIFIED_PRODUCT_EDITOR_REQUIRED",
      message: "Save product and V2 configuration together using PUT /dashboard/products/:id/editor with both expected versions." });
  }
}
