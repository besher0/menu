import { cache } from "react";
import { notFound } from "next/navigation";
import { getPublicMenu, isPublicMenuNotFoundError, type PublicMenuData } from "@/lib/api";

const getUntrackedMenu = cache(async (slug: string) => getPublicMenu(slug, { track: false }));

export async function getPublicMenuOrNotFound(
  slug: string,
  options: { track?: boolean } = {}
): Promise<PublicMenuData> {
  try {
    return await (options.track === false ? getUntrackedMenu(slug) : getPublicMenu(slug, options));
  } catch (error) {
    if (isPublicMenuNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
