import type { Metadata } from "next";
import { getPublicMenu } from "@/lib/api";
import { PublicMenuClient } from "@/components/public/public-menu-client";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const data = await getPublicMenu(slug, { track: false });
  const product = data.products.find((item) => item.slug === productSlug);
  const title = product ? `${product.name} | ${data.restaurant.name}` : `${data.restaurant.name} | المنتج`;
  const description = product?.description ?? `تفاصيل المنتج من ${data.restaurant.name}`;
  const image = product?.imageUrl ?? product?.images?.[0]?.url ?? data.restaurant.heroImageUrl ?? undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [image] : undefined
    },
    alternates: {
      canonical: `/m/${slug}/product/${productSlug}`
    }
  };
}

export default async function ProductPage({
  params
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  const data = await getPublicMenu(slug);
  return (
    <div className="public-page">
      <PublicMenuClient data={data} view="product" productSlug={productSlug} />
    </div>
  );
}
