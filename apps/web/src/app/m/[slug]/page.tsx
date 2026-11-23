import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { preferredRestaurantUrl } from "@/lib/public-routes";
import { PublicMenuClient } from "@/components/public/public-menu-client";

export const revalidate = 60;

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

export default async function PublicMenuHome({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ selectedBranch?: string; branch?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  // Also support the local /m/:slug URL; production subdomains redirect in middleware.
  if (!query.selectedBranch && !query.branch) {
    redirect(`/m/${slug}/branches`);
  }
  const data = await getPublicMenuOrNotFound(slug, { track: false });
  return (
    <div className="public-page">
      <PublicMenuClient data={data} view="home" initialUseSubdomainRoutes />
    </div>
  );
}
