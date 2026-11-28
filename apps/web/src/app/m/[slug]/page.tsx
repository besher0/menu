import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getPublicBranchesOrNotFound, getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { isRestaurantSubdomainHost, preferredRestaurantUrl, restaurantPath } from "@/lib/public-routes";
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
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  // Resolve the branch count before rendering any selector UI.
  // Keep explicit branch QR links (including legacy ?branch= links) unchanged.
  if (!query.selectedBranch && !query.branch) {
    const { restaurant } = await getPublicBranchesOrNotFound(slug);
    const branches = restaurant.branches ?? [];
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const useSubdomainRoutes = isRestaurantSubdomainHost(host, slug);
    const nextQuery = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") nextQuery.set(key, value);
      else if (Array.isArray(value)) value.forEach((item) => nextQuery.append(key, item));
    }
    let pathname = restaurantPath(slug, "/branches", useSubdomainRoutes);
    if (branches.length === 1) {
      pathname = restaurantPath(slug, "/", useSubdomainRoutes);
      nextQuery.set("selectedBranch", branches[0].id);
    }
    const search = nextQuery.toString();
    redirect(search ? `${pathname}?${search}` : pathname);
  }
  const data = await getPublicMenuOrNotFound(slug, { track: false });
  return (
    <div className="public-page">
      <PublicMenuClient data={data} view="home" initialUseSubdomainRoutes />
    </div>
  );
}
