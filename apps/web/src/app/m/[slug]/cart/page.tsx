import type { Metadata } from "next";
import { getPublicMenu } from "@/lib/api";
import { PublicMenuClient } from "@/components/public/public-menu-client";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicMenu(slug, { track: false });
  const title = `${data.restaurant.name} | السلة`;
  const description = `مراجعة سلة ${data.restaurant.name} وإرسال الطلب عبر واتساب.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/m/${slug}/cart`
    }
  };
}

export default async function PublicCartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicMenu(slug);

  return (
    <div className="public-page">
      <PublicMenuClient data={data} view="cart" />
    </div>
  );
}
