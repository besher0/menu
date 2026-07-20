import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { MenuBuilderClient } from "@/components/dashboard/menu-builder-client";

export default function BuilderPage() {
  return (
    <AdminShell active="/dashboard/builder">
      <Suspense fallback={null}>
        <MenuBuilderClient />
      </Suspense>
    </AdminShell>
  );
}
