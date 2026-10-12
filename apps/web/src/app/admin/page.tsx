import { AdminShell } from "@/components/admin/admin-shell";
import { AdminOverviewClient } from "@/components/admin/admin-overview-client";

export default function AdminHomePage() {
  return (
    <AdminShell active="/admin">
      <AdminOverviewClient />
    </AdminShell>
  );
}
