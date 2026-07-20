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
}
