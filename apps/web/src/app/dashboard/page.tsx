import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantDashboardHomeClient } from "@/components/dashboard/restaurant-dashboard-client";

export default function DashboardPage() {
  return (
    <AdminShell active="/dashboard">
      <RestaurantDashboardHomeClient />
    </AdminShell>
  );
}
