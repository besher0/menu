import { notFound } from "next/navigation";
import { getPublicBranches, getPublicMenu, isPublicMenuNotFoundError, type PublicBranchesData, type PublicMenuData } from "@/lib/api";

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

export async function getPublicBranchesOrNotFound(slug: string): Promise<PublicBranchesData> {
  try {
    return await getPublicBranches(slug);
  } catch (error) {
    if (isPublicMenuNotFoundError(error)) notFound();
    throw error;
  }
}
