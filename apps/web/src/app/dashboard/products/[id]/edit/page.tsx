import { ProductForm } from "@/components/dashboard/product-form";
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductForm key={id} productId={id} />;
}
