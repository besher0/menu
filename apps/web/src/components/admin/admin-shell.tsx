"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  Globe2,
  Home,
  Image,
  LayoutDashboard,
  MapPinned,
  MessageSquare,
  Package,
  Palette,
  PanelsTopLeft,
  QrCode,
  ReceiptText,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  Utensils
} from "lucide-react";
import { RestaurantContextSync } from "@/components/dashboard/restaurant-context-sync";
import { DashboardRestaurantSwitcher } from "@/components/dashboard/dashboard-restaurant-switcher";
import { getBrowserSession, resolveStoredRestaurant } from "@/lib/session";

const adminBaseNavItems = [
  { href: "/admin", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/admin/restaurants", label: "المطاعم", icon: Store },
  { href: "/admin/subscriptions", label: "الباقات", icon: BadgeDollarSign }
];

const restaurantOwnerNavItems = [
  { href: "/dashboard", label: "الصفحة الرئيسية", icon: Home },
  { href: "/dashboard/products", label: "المنيو", icon: ShoppingBag },
  { href: "/dashboard/categories", label: "الأقسام", icon: Tags },
  { href: "/dashboard/banners", label: "البنرات", icon: Image },
  { href: "/dashboard/feedback", label: "التقييمات والشكاوي", icon: MessageSquare },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings }
];

const restaurantAdminNavItems = [
  { href: "/dashboard", label: "داشبورد المطعم", icon: Home },
  { href: "/dashboard/products", label: "المنيو", icon: Package },
  { href: "/dashboard/categories", label: "الأقسام", icon: Tags },
  { href: "/dashboard/orders", label: "الطلبات", icon: ReceiptText },
  { href: "/dashboard/analytics", label: "التحليلات", icon: BarChart3 },
  { href: "/dashboard/banners", label: "البنرات", icon: Image },
  { href: "/dashboard/builder", label: "منشئ الواجهة", icon: PanelsTopLeft },
  { href: "/dashboard/media", label: "مكتبة", icon: Image },
  { href: "/dashboard/theme", label: "الثيمات", icon: Palette },
  { href: "/dashboard/branches", label: "الفروع", icon: MapPinned },
  { href: "/dashboard/qr", label: "رموز QR", icon: QrCode },
  { href: "/dashboard/domains", label: "الدومينات", icon: Globe2 },
  { href: "/dashboard/feedback", label: "التقييمات والشكاوي", icon: MessageSquare },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings }
];

const adminNavItems = [...adminBaseNavItems, ...restaurantAdminNavItems];

export function AdminShell({
  active,
  children
}: {
  active: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecked, setAuthChecked] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canViewFeedback, setCanViewFeedback] = useState(false);
  const isDashboard = active.startsWith("/dashboard");
  const ownerNavItems = restaurantOwnerNavItems.filter((item) => item.href !== "/dashboard/categories" && (item.href !== "/dashboard/feedback" || canViewFeedback));
  const navItems = active.startsWith("/admin")
    ? adminNavItems
    : isSuperAdmin
      ? adminNavItems
      : ownerNavItems;

  useEffect(() => {
    const session = getBrowserSession();
    if (!session) {
      const query = searchParams.toString();
      const next = `${pathname}${query ? `?${query}` : ""}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    setIsSuperAdmin(session.user.role === "SUPER_ADMIN");
    const restaurantId = resolveStoredRestaurant(session)?.id;
    setCanViewFeedback(session.user.role === "SUPER_ADMIN" || session.memberships.some(m => m.restaurant.id === restaurantId && m.role === "OWNER"));
    setAuthChecked(true);
  }, [pathname, router, searchParams]);

  if (!authChecked) {
    return null;
  }

  return (
    <div className="admin-shell restaurant-admin-shell">
      <aside className="admin-sidebar" aria-label="لوحة تحكم المطعم">
        <div className="admin-brand">
          <Utensils size={42} strokeWidth={1.8} />
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.href;

            return (
              <Link key={item.href} href={item.href} className={isActive ? "side-link active" : "side-link"}>
                <Icon size={21} strokeWidth={1.9} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="admin-main restaurant-admin-main">
        <RestaurantContextSync />
        {isDashboard && <div className="merchant-switcher"><DashboardRestaurantSwitcher /></div>}
        {children}
      </main>
    </div>
  );
}
