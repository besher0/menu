import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantCategoriesClient } from "@/components/dashboard/restaurant-dashboard-client";

export default function DashboardCategoriesPage() {
  return (
    <AdminShell active="/dashboard/categories">
      <RestaurantCategoriesClient />
    </AdminShell>
  );
}
