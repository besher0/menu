import { BadRequestException, ConflictException } from "@nestjs/common";
import { normalizeMoney, validateCurrencyAmount } from "@menu/shared";

/** null means the restaurant will determine the delivery fee by area. */
export function parseDeliveryFeeInput(value: unknown, currency: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || validateCurrencyAmount(value, currency, "$deliveryFee").length) {
    throw new BadRequestException({ error: "INVALID_DELIVERY_FEE", message: "Delivery fee must be a non-negative amount valid for the restaurant currency." });
  }
  return normalizeMoney(value);
}

export function readDeliveryFee(settings: unknown, currency: string): string | null {
  const value = settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>).deliveryFee : undefined;
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || validateCurrencyAmount(value, currency, "$deliveryFee").length) {
    throw new ConflictException({ error: "INVALID_STORED_DELIVERY_FEE", message: "The restaurant delivery fee is not valid for its currency." });
  }
  return normalizeMoney(value);
}
