import { AdminShell } from "@/components/admin/admin-shell";
import { OrdersClient } from "@/components/dashboard/orders-client";

export default function DashboardOrdersPage() {
  return (
    <AdminShell active="/dashboard/orders">
      <OrdersClient />
    </AdminShell>
  );
}
