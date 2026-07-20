import { AdminShell } from "@/components/admin/admin-shell";
import { BranchesClient } from "@/components/dashboard/branches-client";

export default function DashboardBranchesPage() {
  return (
    <AdminShell active="/dashboard/branches">
      <BranchesClient />
    </AdminShell>
  );
}
