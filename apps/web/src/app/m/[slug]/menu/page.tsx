import type { Metadata } from "next";
import { getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { preferredRestaurantUrl } from "@/lib/public-routes";
import { PublicMenuClient } from "@/components/public/public-menu-client";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicMenuOrNotFound(slug, { track: false });
  const title = `${data.restaurant.name} | قائمة الطعام`;
  const description = `تصفح أصناف ${data.restaurant.name} والطلبات عبر واتساب.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: preferredRestaurantUrl(slug, "/menu"),
      images: data.restaurant.heroImageUrl ? [data.restaurant.heroImageUrl] : undefined
    },
    alternates: {
      canonical: preferredRestaurantUrl(slug, "/menu")
    }
  };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicMenuOrNotFound(slug);
  return (
    <div className="public-page">
      <PublicMenuClient data={data} view="menu" initialUseSubdomainRoutes />
    </div>
  );
}
