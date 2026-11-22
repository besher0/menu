import type { Prisma } from "@prisma/client";

export type ProductReview = "missingImage" | "unavailable";

export function productReviewWhere(review?: ProductReview): Prisma.ProductWhereInput {
  if (review === "missingImage") return { images: { none: { isActive: true } } };
  if (review === "unavailable") return { isAvailable: false };
  return {};
}
