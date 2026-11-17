import { ForbiddenException } from "@nestjs/common";
import { roleHasPermission } from "@menu/shared";
import { AppRequest } from "./app-request";

export function requireRestaurantPermission(request: AppRequest, permission: string) {
  if (request.restaurant && (request.user?.role === "SUPER_ADMIN" ||
      roleHasPermission(request.restaurant.role, permission))) return;
  throw new ForbiddenException("Insufficient restaurant permission");
}
