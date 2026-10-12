import { AdminShell } from "@/components/admin/admin-shell";
import { MediaLibraryClient } from "@/components/dashboard/media-library-client";

export default function DashboardMediaPage() {
  return (
    <AdminShell active="/dashboard/media">
      <MediaLibraryClient />
    </AdminShell>
  );
}
