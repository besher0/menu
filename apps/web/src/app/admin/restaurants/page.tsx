import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantsClient } from "@/components/admin/restaurants-client";

export default function RestaurantsPage() {
  return (
    <AdminShell active="/admin/restaurants">
      <RestaurantsClient />
    </AdminShell>
  );
}
