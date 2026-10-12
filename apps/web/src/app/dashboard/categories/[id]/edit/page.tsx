import { AdminShell } from "@/components/admin/admin-shell";
import { CategoryForm } from "@/components/dashboard/category-form";
import { SuperAdminDashboardOnly } from "@/components/dashboard/super-admin-dashboard-only";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AdminShell active="/dashboard/categories">
      <SuperAdminDashboardOnly>
        <CategoryForm categoryId={id} />
      </SuperAdminDashboardOnly>
    </AdminShell>
  );
}
