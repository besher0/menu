import type { Metadata } from "next";
import { getPublicMenuOrNotFound } from "@/lib/public-menu-page";
import { publicMenuMetadata } from "@/lib/public-menu-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return publicMenuMetadata(await getPublicMenuOrNotFound(slug), { view: "cart" });
}

// The persistent restaurant layout owns the original public UI. This route
// keeps direct entry, server metadata and Next's normal route/error boundaries.
export default function PublicPage() { return null; }
