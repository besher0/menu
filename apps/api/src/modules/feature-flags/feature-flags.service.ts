import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { FeatureKey } from "@menu/shared";
import { PrismaService } from "../prisma/prisma.service";

const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIALING"] as const;

@Injectable()
export class FeatureFlagsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canUseFeature(restaurantId: string, key: FeatureKey): Promise<boolean> {
    const feature = await this.getFeature(restaurantId, key);
    return Boolean(feature?.enabled);
  }

  async getFeatureLimit(restaurantId: string, key: FeatureKey): Promise<number | null> {
    const feature = await this.getFeature(restaurantId, key);
    return feature?.limit ?? null;
  }

  async assertFeature(restaurantId: string, key: FeatureKey): Promise<void> {
    const canUse = await this.canUseFeature(restaurantId, key);

    if (!canUse) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "FEATURE_LOCKED",
        message: "This feature is not enabled for the current subscription",
        featureKey: key
      });
    }
  }

  /**
   * Product Configuration is an assigned package capability, not a billing-cycle switch.
   * The current schema stores the assigned plan on RestaurantSubscription, so this lookup
   * intentionally ignores subscription status while still requiring an enabled plan feature.
   */
  async canUseAssignedFeature(restaurantId: string, key: FeatureKey): Promise<boolean> {
    const feature = await this.getAssignedFeature(restaurantId, key);
    return Boolean(feature?.enabled);
  }

  async assertAssignedFeature(restaurantId: string, key: FeatureKey): Promise<void> {
    if (!(await this.canUseAssignedFeature(restaurantId, key))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "FEATURE_LOCKED",
        message: "This capability is not assigned to the current restaurant package",
        featureKey: key
      });
    }
  }

  async listFeatures(restaurantId: string) {
    const subscription = await this.prisma.restaurantSubscription.findUnique({
      where: { restaurantId },
      include: {
        plan: {
          include: {
            features: true
          }
        }
      }
    });

    if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status as never)) {
      return [];
    }

    return subscription.plan.features.map((feature) => ({
      key: feature.key,
      enabled: feature.enabled,
      limit: feature.limit
    }));
  }

  private async getFeature(restaurantId: string, key: FeatureKey) {
    const subscription = await this.prisma.restaurantSubscription.findUnique({
      where: { restaurantId },
      include: {
        plan: {
          include: {
            features: {
              where: { key }
            }
          }
        }
      }
    });

    if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status as never)) {
      return null;
    }

    return subscription.plan.features[0] ?? null;
  }

  private async getAssignedFeature(restaurantId: string, key: FeatureKey) {
    const subscription = await this.prisma.restaurantSubscription.findUnique({
      where: { restaurantId },
      include: {
        plan: {
          include: {
            features: {
              where: { key }
            }
          }
        }
      }
    });

    return subscription?.plan.features[0] ?? null;
  }
}
