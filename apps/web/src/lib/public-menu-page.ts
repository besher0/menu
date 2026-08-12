import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicMenu, isPublicMenuNotFoundError, type PublicMenuData } from "@/lib/api";
import {
  INTERNAL_RESTAURANT_REWRITE_HEADER,
  INTERNAL_RESTAURANT_REWRITE_VALUE,
  isRestaurantSubdomainHost
} from "@/lib/public-routes";

export async function requireInternalRestaurantRewrite(slug: string) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? requestHeaders.get("x-forwarded-host");
  const isInternalRewrite =
    requestHeaders.get(INTERNAL_RESTAURANT_REWRITE_HEADER) === INTERNAL_RESTAURANT_REWRITE_VALUE;

  if (!isInternalRewrite || !isRestaurantSubdomainHost(host, slug)) {
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
