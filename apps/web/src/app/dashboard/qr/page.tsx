import { AdminShell } from "@/components/admin/admin-shell";
import { QrDashboardClient } from "@/components/dashboard/qr-dashboard-client";

export default function DashboardQrPage() {
  return (
    <AdminShell active="/dashboard/qr">
      <QrDashboardClient />
    </AdminShell>
  );
}
