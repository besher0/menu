import type { Metadata } from "next";
import type { PublicMenuData } from "./api";
import { preferredRestaurantUrl } from "./public-routes";
import { findSnapshotProduct, type RestaurantRoute } from "@/components/public/restaurant-shell-model";

// Identical metadata for direct SSR entry and a local shell transition.
export function publicMenuMetadata(data: PublicMenuData, route: RestaurantRoute): Metadata {
  const { restaurant } = data;
  const product = route.view === "product" ? findSnapshotProduct(data, route.productSlug) : undefined;
  const title = route.view === "product" ? product ? `${product.name} | ${restaurant.name}` : `${restaurant.name} | المنتج`
    : `${restaurant.name} | ${route.view === "menu" ? "قائمة الطعام" : route.view === "cart" ? "السلة" : "المنيو"}`;
  const description = route.view === "product" ? product?.description ?? `تفاصيل المنتج من ${restaurant.name}`
    : route.view === "menu" ? `تصفح أصناف ${restaurant.name} والطلبات عبر واتساب.`
    : route.view === "cart" ? `مراجعة سلة ${restaurant.name} وإرسال الطلب عبر واتساب.`
    : restaurant.type ? `${restaurant.name} - ${restaurant.type} في ${restaurant.city ?? ""}` : `منيو ${restaurant.name}`;
  const pathname = route.view === "home" ? "" : route.view === "product"
    ? `/product/${encodeURIComponent(product?.id ?? route.productSlug ?? "")}` : `/${route.view}`;
  const url = preferredRestaurantUrl(restaurant.slug, pathname);
  const image = route.view === "cart" ? undefined : product?.imageUrl ?? product?.images?.[0]?.url ?? restaurant.heroImageUrl ?? undefined;
  return { title, description, openGraph: { title, description, url, images: image ? [image] : undefined }, alternates: { canonical: url } };
}
