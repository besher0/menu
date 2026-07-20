export class CreateSyncJobDto {
  type!: "PRODUCTS" | "CATEGORIES" | "MENUS" | "ORDERS" | "THEME" | "MEDIA" | "SETTINGS" | "ANALYTICS";
  direction?: "PUSH" | "PULL";
  payload?: Record<string, unknown>;
}
