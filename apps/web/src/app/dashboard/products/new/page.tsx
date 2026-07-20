import { AdminShell } from "@/components/admin/admin-shell";
import { ProductForm } from "@/components/dashboard/product-form";

export default function NewProductPage() {
  return (
    <AdminShell active="/dashboard">
      <ProductForm />
    </AdminShell>
  );
}
