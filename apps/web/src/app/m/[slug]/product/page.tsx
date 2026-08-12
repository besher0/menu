import { redirect } from "next/navigation";
import { getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { restaurantPath } from "@/lib/public-routes";

export default async function ProductIndexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await getPublicMenuOrNotFound(slug, { track: false });
  redirect(restaurantPath(slug, "/menu", true));
}
