import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ProductConfigurationV1, validateConfiguration } from "@menu/shared";
import { Prisma } from "@prisma/client";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProductConfigurationDto } from "./dto/update-product-configuration.dto";
import {
  persistProductConfiguration,
  ProductConfigurationCapabilityError,
  ProductConfigurationConflictError,
  ProductConfigurationValidationError
} from "./product-configuration.persistence";

const SERIALIZABLE_RETRY_LIMIT = 3;

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
          : capabilityAssigned
            ? "PUBLIC_INTEGRATION_PENDING"
            : "ACTION_REQUIRED_CAPABILITY"
    };
  }

  async save(restaurantId: string, productId: string, dto: UpdateProductConfigurationDto) {
    await this.featureFlags.assertAssignedFeature(restaurantId, "PRODUCT_CONFIGURATION");
    const configuration = this.validateUntrustedConfiguration(dto.configuration);

    if (configuration.productId !== productId) {
      throw this.validationException([
        {
          code: "CONFIGURATION_PRODUCT_MISMATCH",
          path: "$configuration.productId",
          message: "Configuration productId must match the route product ID."
        }
      ]);
    }
    if (configuration.revision !== dto.expectedVersion + 1) {
      throw this.validationException([
        {
          code: "INVALID_NEXT_REVISION",
          path: "$configuration.revision",
          message: "Configuration revision must equal expectedVersion + 1."
        }
      ]);
    }

    const owner = await this.prisma.product.findFirst({
      where: { id: productId, restaurantId, deletedAt: null },
      select: { id: true }
    });
    if (!owner) throw new NotFoundException("Product not found");

    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        await persistProductConfiguration(this.prisma, {
          restaurantId,
          productId,
          expectedVersion: dto.expectedVersion,
          configuration,
          requiredCapabilityKey: "PRODUCT_CONFIGURATION"
        });
        return this.get(restaurantId, productId);
      } catch (error) {
        if (this.isSerializableRetry(error) && attempt < SERIALIZABLE_RETRY_LIMIT) continue;
        throw this.toHttpException(error);
      }
    }

    throw new ConflictException({
      statusCode: 409,
      error: "PRODUCT_CONFIGURATION_CONCURRENT_UPDATE",
      message: "The configuration could not be saved after concurrent transaction retries."
    });
  }

  private validateUntrustedConfiguration(value: unknown): ProductConfigurationV1 {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw this.validationException([
        { code: "INVALID_CONFIGURATION_SHAPE", path: "$configuration", message: "Configuration must be an object." }
      ]);
    }

    try {
      const configuration = value as ProductConfigurationV1;
      const issues = validateConfiguration(configuration);
      if (issues.length) throw this.validationException(issues);
      return configuration;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.validationException([
        {
          code: "INVALID_CONFIGURATION_SHAPE",
          path: "$configuration",
          message: "Configuration structure is malformed."
        }
      ]);
    }
  }

  private validationException(issues: Array<{ code: string; path: string; message: string }>) {
    return new BadRequestException({
      statusCode: 400,
      error: "PRODUCT_CONFIGURATION_VALIDATION_FAILED",
      message: "Product configuration validation failed",
      issues
    });
  }

  private isSerializableRetry(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
  }

  private toHttpException(error: unknown): Error {
    const taggedKind = error && typeof error === "object" && "kind" in error
      ? error.kind
      : null;
    if (
      error instanceof ProductConfigurationCapabilityError
      || taggedKind === "PRODUCT_CONFIGURATION_CAPABILITY_DENIED"
    ) {
      return new ForbiddenException({
        statusCode: 403,
        error: "FEATURE_LOCKED",
        message: "Product Configuration capability is not assigned to the current restaurant package.",
        featureKey: "PRODUCT_CONFIGURATION"
      });
    }
    if (
      error instanceof ProductConfigurationValidationError
      || taggedKind === "PRODUCT_CONFIGURATION_VALIDATION"
    ) {
      return this.validationException((error as ProductConfigurationValidationError).issues);
    }
    if (
      error instanceof ProductConfigurationConflictError
      || taggedKind === "PRODUCT_CONFIGURATION_CONFLICT"
    ) {
      return new ConflictException({
        statusCode: 409,
        error: error instanceof ProductConfigurationConflictError
          ? error.code
          : "PRODUCT_CONFIGURATION_CONFLICT",
        message: error instanceof Error ? error.message : "Product configuration conflict",
        ...(error instanceof ProductConfigurationConflictError && error.details
          ? { details: error.details }
          : {})
      });
    }
    if (this.isSerializableRetry(error)) {
      return new ConflictException({
        statusCode: 409,
        error: "PRODUCT_CONFIGURATION_CONCURRENT_UPDATE",
        message: "The configuration changed concurrently; reload and retry."
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new ConflictException({
        statusCode: 409,
        error: "PRODUCT_CONFIGURATION_CONFLICT",
        message: "The configuration dependency index changed concurrently; reload and retry."
      });
    }
    return error instanceof Error ? error : new Error("Unknown product configuration persistence error");
  }
}
