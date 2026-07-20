import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantBannersClient } from "@/components/dashboard/restaurant-dashboard-client";

export default function DashboardBannersPage() {
  return (
    <AdminShell active="/dashboard/banners">
      <RestaurantBannersClient />
    </AdminShell>
  );
}
