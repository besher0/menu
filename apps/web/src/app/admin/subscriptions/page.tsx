import { AdminShell } from "@/components/admin/admin-shell";
import { SubscriptionsClient } from "@/components/admin/subscriptions-client";

export default function SubscriptionsPage() {
  return (
    <AdminShell active="/admin/subscriptions">
      <SubscriptionsClient />
    </AdminShell>
  );
}
