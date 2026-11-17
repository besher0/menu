import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { RestaurantProductsClient } from "@/components/dashboard/restaurant-dashboard-client";

// The catalog stays mounted under the editor, including its search, order and scroll.
export default function ProductsLayout({ children }: { children: ReactNode }) {
  return <AdminShell active="/dashboard/products"><RestaurantProductsClient />{children}</AdminShell>;
}
