import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isRestaurantSubdomainHost, restaurantPath } from "@/lib/public-routes";

export default async function ProductIndexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  redirect(restaurantPath(slug, "/menu", isRestaurantSubdomainHost(host, slug)));
}
