import { AdminShell } from "@/components/admin/admin-shell";
import { AnalyticsClient } from "@/components/dashboard/analytics-client";

export default function DashboardAnalyticsPage() {
  return (
    <AdminShell active="/dashboard/analytics">
      <AnalyticsClient />
    </AdminShell>
  );
}
