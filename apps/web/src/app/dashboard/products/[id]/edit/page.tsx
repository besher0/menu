import { AdminShell } from "@/components/admin/admin-shell";
import { ProductForm } from "@/components/dashboard/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AdminShell active="/dashboard">
      <ProductForm productId={id} />
    </AdminShell>
  );
}
