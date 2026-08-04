import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantCategoriesClient } from "@/components/dashboard/restaurant-dashboard-client";
import { SuperAdminDashboardOnly } from "@/components/dashboard/super-admin-dashboard-only";

export default function DashboardCategoriesPage() {
  return (
    <AdminShell active="/dashboard/categories">
      <SuperAdminDashboardOnly>
        <RestaurantCategoriesClient />
      </SuperAdminDashboardOnly>
    </AdminShell>
  );
}
