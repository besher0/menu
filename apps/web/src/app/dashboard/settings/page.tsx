import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantSettingsClient } from "@/components/dashboard/restaurant-dashboard-client";

export default function DashboardSettingsPage() {
  return (
    <AdminShell active="/dashboard/settings">
      <RestaurantSettingsClient />
    </AdminShell>
  );
}
