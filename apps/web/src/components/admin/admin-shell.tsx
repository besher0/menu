"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  ChevronDown,
  Globe2,
  Home,
  Image,
  LayoutDashboard,
  MapPinned,
  Package,
  Palette,
  PanelsTopLeft,
  QrCode,
  ReceiptText,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  Utensils
} from "lucide-react";
import { RestaurantContextSync } from "@/components/dashboard/restaurant-context-sync";
import { DashboardRestaurantSwitcher } from "@/components/dashboard/dashboard-restaurant-switcher";
import { getBrowserSession } from "@/lib/session";

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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const isDashboard = active.startsWith("/dashboard");
  const ownerNavItems = restaurantOwnerNavItems.filter((item) => item.href !== "/dashboard/categories");
  const navItems = active.startsWith("/admin")
    ? adminNavItems
    : isSuperAdmin
      ? adminNavItems
      : ownerNavItems;

  useEffect(() => {
    setIsSuperAdmin(getBrowserSession()?.user.role === "SUPER_ADMIN");
  }, []);

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
        <header className={isDashboard ? "admin-topbar restaurant-topbar has-restaurant-switcher" : "admin-topbar restaurant-topbar"}>
          <div className="profile-chip">
            <span className="avatar" />
            <div>
              <strong>محمد أحمد</strong>
              <small>أدمن</small>
            </div>
            <ChevronDown size={17} />
          </div>
          {isDashboard ? <DashboardRestaurantSwitcher /> : null}
          <button className="icon-button" aria-label="الإشعارات">
            <Bell size={23} />
          </button>
          <label className="search-box">
            <Search size={23} />
            <input placeholder="قم بالبحث هنا" />
          </label>
        </header>
        {children}
      </main>
    </div>
  );
}
