import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicMenu, isPublicMenuNotFoundError, type PublicMenuData } from "@/lib/api";
import {
  INTERNAL_RESTAURANT_REWRITE_HEADER,
  INTERNAL_RESTAURANT_REWRITE_VALUE,
  INTERNAL_RESTAURANT_SLUG_HEADER
} from "@/lib/public-routes";

export async function requireInternalRestaurantRewrite(slug: string) {
  const requestHeaders = await headers();
  const isInternalRewrite =
    requestHeaders.get(INTERNAL_RESTAURANT_REWRITE_HEADER) === INTERNAL_RESTAURANT_REWRITE_VALUE;
  const internalSlug = requestHeaders.get(INTERNAL_RESTAURANT_SLUG_HEADER);

  if (!isInternalRewrite || internalSlug !== slug) {
    notFound();
  }
}

export async function getPublicMenuOrNotFound(
  slug: string,
  options: { track?: boolean } = {}
): Promise<PublicMenuData> {
  try {
    return await getPublicMenu(slug, options);
  } catch (error) {
    if (isPublicMenuNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
