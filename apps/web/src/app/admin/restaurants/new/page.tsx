import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantForm } from "@/components/admin/restaurant-form";

export default function NewRestaurantPage() {
  return (
    <AdminShell active="/admin/restaurants">
      <RestaurantForm />
    </AdminShell>
  );
}
