export const GLOBAL_ROLES = ["SUPER_ADMIN", "USER"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const RESTAURANT_ROLES = ["OWNER", "MANAGER", "EDITOR", "EMPLOYEE"] as const;
export type RestaurantRole = (typeof RESTAURANT_ROLES)[number];

export const ROLE_PERMISSIONS: Record<RestaurantRole, string[]> = {
  OWNER: [
    "restaurant.update",
    "branch.create",
    "branch.update",
    "product.create",
    "product.update",
    "theme.update",
    "menu.publish",
    "analytics.view",
    "subscription.manage",
    "domain.manage",
    "white_label.manage"
  ],
  MANAGER: [
    "branch.create",
    "branch.update",
    "product.create",
    "product.update",
    "theme.update",
    "menu.publish",
    "analytics.view"
  ],
  EDITOR: ["product.create", "product.update", "theme.update", "menu.publish"],
  EMPLOYEE: ["product.update"]
};

export function roleHasPermission(role: RestaurantRole, permission: string) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
