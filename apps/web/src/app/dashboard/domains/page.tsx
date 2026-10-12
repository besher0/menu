import { AdminShell } from "@/components/admin/admin-shell";
import { DomainsClient } from "@/components/dashboard/domains-client";

export default function DashboardDomainsPage() {
  return (
    <AdminShell active="/dashboard/domains">
      <DomainsClient />
    </AdminShell>
  );
}
