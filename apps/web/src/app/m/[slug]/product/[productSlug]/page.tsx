import type { Metadata } from "next";
import { getPublicMenu } from "@/lib/api";
import { preferredRestaurantUrl } from "@/lib/public-routes";
import { PublicMenuClient } from "@/components/public/public-menu-client";

function normalizeRouteKey(value?: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim().toLowerCase().replace(/\s+/g, "-");
  } catch {
    return value.trim().toLowerCase().replace(/\s+/g, "-");
  }
}

function productMatchesRoute(product: { id?: string; slug: string }, value: string) {
  const decoded = normalizeRouteKey(value);
  return product.id === value
    || product.slug === value
    || normalizeRouteKey(product.id) === decoded
    || normalizeRouteKey(product.slug) === decoded;
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const data = await getPublicMenu(slug, { track: false });
  const product = data.products.find((item) => productMatchesRoute(item, productSlug));
  const title = product ? `${product.name} | ${data.restaurant.name}` : `${data.restaurant.name} | المنتج`;
  const description = product?.description ?? `تفاصيل المنتج من ${data.restaurant.name}`;
  const image = product?.imageUrl ?? product?.images?.[0]?.url ?? data.restaurant.heroImageUrl ?? undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: preferredRestaurantUrl(slug, `/product/${encodeURIComponent(product?.id ?? productSlug)}`),
      images: image ? [image] : undefined
    },
    alternates: {
      canonical: preferredRestaurantUrl(slug, `/product/${encodeURIComponent(product?.id ?? productSlug)}`)
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
