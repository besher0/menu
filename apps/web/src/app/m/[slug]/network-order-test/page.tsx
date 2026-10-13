import { notFound } from "next/navigation";
import { getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { networkOrderTestPageEnabled } from "@/lib/network-order-test-guard";
import { NetworkOrderTestClient } from "@/components/public/network-order-test-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NetworkOrderTestPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await networkOrderTestPageEnabled())) notFound();
  const { slug } = await params;
  const menu = await getPublicMenuOrNotFound(slug, { track: false });
  if (!menu.restaurant.currency) notFound();
  return <NetworkOrderTestClient restaurantSlug={menu.restaurant.slug} currency={menu.restaurant.currency} />;
}
