import type { Metadata } from "next";
import { getPublicBranchesOrNotFound } from "@/lib/public-menu-page";
import { preferredRestaurantUrl } from "@/lib/public-routes";
import { BranchSelectorClient } from "@/components/public/branch-selector-client";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicBranchesOrNotFound(slug);
  return {
    title: `اختر الفرع | ${data.restaurant.name}`,
    description: `اختر فرع ${data.restaurant.name} لعرض المنيو والطلب عبر واتساب.`,
    alternates: { canonical: preferredRestaurantUrl(slug, "/branches") }
  };
}

export default async function RestaurantBranchesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicBranchesOrNotFound(slug);

  return <BranchSelectorClient restaurant={data.restaurant} />;
}
