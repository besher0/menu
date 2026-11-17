import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublicMenu, isPublicMenuNotFoundError, type PublicMenuData } from "@/lib/api";

// React cache is scoped to one server render, not a cross-request/tenant cache.
// Primitive slug key avoids distinct metadata/page options breaking deduplication.
export const getPublicMenuOrNotFound = cache(async (slug: string): Promise<PublicMenuData> => {
  try {
    return await getPublicMenu(slug);
  } catch (error) {
    if (isPublicMenuNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
});
