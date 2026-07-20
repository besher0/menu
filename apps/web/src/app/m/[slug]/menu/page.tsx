import type { Metadata } from "next";
import { getPublicMenu } from "@/lib/api";
import { PublicMenuClient } from "@/components/public/public-menu-client";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicMenu(slug, { track: false });
  const title = `${data.restaurant.name} | قائمة الطعام`;
  const description = `تصفح أصناف ${data.restaurant.name} والطلبات عبر واتساب.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: data.restaurant.heroImageUrl ? [data.restaurant.heroImageUrl] : undefined
    },
    alternates: {
      canonical: `/m/${slug}/menu`
    }
  };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicMenu(slug);
  return (
    <div className="public-page">
      <PublicMenuClient data={data} view="menu" />
    </div>
  );
}
