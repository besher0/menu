import { redirect } from "next/navigation";
import { getPublicMenuOrNotFound, requireInternalRestaurantRewrite } from "@/lib/public-menu-page";
import { restaurantPath } from "@/lib/public-routes";

export default async function ProductIndexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireInternalRestaurantRewrite(slug);
  await getPublicMenuOrNotFound(slug, { track: false });
  redirect(restaurantPath(slug, "/menu", true));
}
