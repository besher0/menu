import { AdminShell } from "@/components/admin/admin-shell";
import { CategoryForm } from "@/components/dashboard/category-form";
import { SuperAdminDashboardOnly } from "@/components/dashboard/super-admin-dashboard-only";

export default function NewCategoryPage() {
  return (
    <AdminShell active="/dashboard/categories">
      <SuperAdminDashboardOnly>
        <CategoryForm />
      </SuperAdminDashboardOnly>
    </AdminShell>
  );
}
