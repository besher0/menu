import { AdminShell } from "@/components/admin/admin-shell";
import { ThemeBuilderClient } from "@/components/dashboard/theme-builder-client";

export default function ThemePage() {
  return (
    <AdminShell active="/dashboard/theme">
      <ThemeBuilderClient />
    </AdminShell>
  );
}
