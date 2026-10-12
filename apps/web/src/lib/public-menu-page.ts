import { notFound } from "next/navigation";
import { getPublicMenu, isPublicMenuNotFoundError, type PublicMenuData } from "@/lib/api";

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
