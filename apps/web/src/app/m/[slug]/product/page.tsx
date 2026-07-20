import { redirect } from "next/navigation";

export default async function ProductIndexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/m/${slug}/menu`);
}
