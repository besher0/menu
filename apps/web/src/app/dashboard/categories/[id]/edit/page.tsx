import { AdminShell } from "@/components/admin/admin-shell";
import { CategoryForm } from "@/components/dashboard/category-form";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AdminShell active="/dashboard/categories">
      <CategoryForm categoryId={id} />
    </AdminShell>
  );
}
