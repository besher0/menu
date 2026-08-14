import type { Metadata } from "next";
import { getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { preferredRestaurantUrl } from "@/lib/public-routes";
import { PublicMenuClient } from "@/components/public/public-menu-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicMenuOrNotFound(slug, { track: false });
  const title = `${data.restaurant.name} | المنيو`;
  const description = data.restaurant.type
    ? `${data.restaurant.name} - ${data.restaurant.type} في ${data.restaurant.city ?? ""}`
    : `منيو ${data.restaurant.name}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: preferredRestaurantUrl(slug),
      images: data.restaurant.heroImageUrl ? [data.restaurant.heroImageUrl] : undefined
    },
    alternates: {
      canonical: preferredRestaurantUrl(slug)
    }
  };
}

export default async function PublicMenuHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicMenuOrNotFound(slug);
  return (
    <div className="public-page">
      <PublicMenuClient data={data} view="home" initialUseSubdomainRoutes />
    </div>
  );
}
