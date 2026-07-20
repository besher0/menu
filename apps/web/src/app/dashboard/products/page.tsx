import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantProductsClient } from "@/components/dashboard/restaurant-dashboard-client";

export default function DashboardProductsPage() {
  return (
    <AdminShell active="/dashboard/products">
      <RestaurantProductsClient />
    </AdminShell>
  );
}
