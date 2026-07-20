import { AdminShell } from "@/components/admin/admin-shell";
import { CategoryForm } from "@/components/dashboard/category-form";

export default function NewCategoryPage() {
  return (
    <AdminShell active="/dashboard/categories">
      <CategoryForm />
    </AdminShell>
  );
}
