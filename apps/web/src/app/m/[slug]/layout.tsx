import { headers } from "next/headers";
import type { ReactNode } from "react";
import { RestaurantShell } from "@/components/public/restaurant-shell";
import { getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { isRestaurantSubdomainHost } from "@/lib/public-routes";
import { networkOrderTestPageEnabled } from "@/lib/network-order-test-guard";

export default async function RestaurantLayout({ params, children }: { params: Promise<{ slug: string }>; children: ReactNode }) {
  const { slug } = await params;
  const data = await getPublicMenuOrNotFound(slug);
  const requestHeaders = await headers();
  const shortRoutes = isRestaurantSubdomainHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"), slug);
  return <RestaurantShell key={slug} initialData={data} shortRoutes={shortRoutes} testEnabled={await networkOrderTestPageEnabled()}>
    {children}
  </RestaurantShell>;
}
