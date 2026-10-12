import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { MenuBuilderClient } from "@/components/dashboard/menu-builder-client";
import { SkeletonForm } from "@/components/ui/skeleton";

export default function BuilderPage() {
  return (
    <AdminShell active="/dashboard/builder">
      <Suspense fallback={<SkeletonForm fields={8} />}>
        <MenuBuilderClient />
      </Suspense>
    </AdminShell>
  );
}
