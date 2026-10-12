import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { AppRequest } from "../app-request";
import { PrismaService } from "../../modules/prisma/prisma.service";

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class RestaurantContextGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Missing authenticated user");
    }

    const restaurantId = firstHeader(request.headers["x-restaurant-id"]);
    const restaurantSlug = firstHeader(request.headers["x-restaurant-slug"]);

    const membership = await this.prisma.restaurantMember.findFirst({
      where: {
        userId: user.sub,
        restaurant: {
          ...(restaurantId ? { id: restaurantId } : {}),
          ...(restaurantSlug ? { slug: restaurantSlug } : {}),
          deletedAt: null
        }
      },
      include: { restaurant: true },
      orderBy: { createdAt: "asc" }
    });

    if (membership) {
      request.restaurant = {
        id: membership.restaurant.id,
        slug: membership.restaurant.slug,
        name: membership.restaurant.name,
        role: membership.role
      };
      return true;
    }

    if (user.role === "SUPER_ADMIN") {
      const restaurant = await this.prisma.restaurant.findFirst({
        where: {
          ...(restaurantId ? { id: restaurantId } : {}),
          ...(restaurantSlug ? { slug: restaurantSlug } : {}),
          deletedAt: null
        },
        orderBy: { createdAt: "asc" }
      });

      if (restaurant) {
        request.restaurant = {
          id: restaurant.id,
          slug: restaurant.slug,
          name: restaurant.name,
          role: "OWNER"
        };
        return true;
      }
    }

    throw new ForbiddenException("User is not a member of this restaurant");
  }
}
