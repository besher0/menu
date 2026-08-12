import type { Metadata } from "next";
import { getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { preferredRestaurantUrl } from "@/lib/public-routes";
import { PublicMenuClient } from "@/components/public/public-menu-client";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicMenuOrNotFound(slug, { track: false });
  const title = `${data.restaurant.name} | السلة`;
  const description = `مراجعة سلة ${data.restaurant.name} وإرسال الطلب عبر واتساب.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: preferredRestaurantUrl(slug, "/cart")
    },
    alternates: {
      canonical: preferredRestaurantUrl(slug, "/cart")
    }
  };
}

export default async function PublicCartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicMenuOrNotFound(slug);

  return (
    <div className="public-page">
      <PublicMenuClient data={data} view="cart" initialUseSubdomainRoutes />
    </div>
  );
}
