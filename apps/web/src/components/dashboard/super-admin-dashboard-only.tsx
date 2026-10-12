"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSession } from "@/lib/session";

export function SuperAdminDashboardOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (getBrowserSession()?.user.role === "SUPER_ADMIN") {
      setAllowed(true);
      return;
    }

    router.replace("/dashboard/products");
  }, [router]);

  return allowed ? <>{children}</> : null;
}
