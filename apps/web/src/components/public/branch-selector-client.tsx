"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MapPin, Store, ArrowRight, CheckCircle2 } from "lucide-react";
import type { PublicMenuData } from "@/lib/api";
import { isRestaurantSubdomainHost, restaurantPath } from "@/lib/public-routes";

type Restaurant = PublicMenuData["restaurant"];

export function BranchSelectorClient({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const branches = restaurant.branches ?? [];
  const [lastBranchId, setLastBranchId] = useState<string | null>(null);
  const [openingBranch, setOpeningBranch] = useState<string | null>(null);

  function branchHref(id: string) {
    const subdomain = isRestaurantSubdomainHost(window.location.host, restaurant.slug);
    return `${restaurantPath(restaurant.slug, "/", subdomain)}?selectedBranch=${encodeURIComponent(id)}`;
  }

  useEffect(() => {
    try {
      setLastBranchId(window.localStorage.getItem(`ordersawa:last-branch:${restaurant.slug}`));
    } catch {
      // Browsers may block storage; selection still works without it.
    }
    if (branches.length === 1) {
      router.replace(branchHref(branches[0].id));
    }
  }, [branches.length, restaurant.slug, router]);

  function selectBranch(id: string) {
    if (openingBranch) return;
    setOpeningBranch(id);
    try {
      window.localStorage.setItem(`ordersawa:last-branch:${restaurant.slug}`, id);
    } catch {
      // Storage is optional; the branch stays in the URL.
    }
    router.push(branchHref(id));
  }

  return (
    <main className="os-branch-selector" dir="rtl">
      <div className="os-branch-selector-shell">
        <div className="os-branch-selector-brand">
          {restaurant.logoUrl ? (
            <img src={restaurant.logoUrl} alt={restaurant.name} className="os-branch-selector-logo" />
          ) : (
            <div className="os-branch-selector-logo os-branch-selector-logo-empty"><Store size={34} /></div>
          )}
          <p className="os-branch-selector-kicker">أهلاً وسهلاً في</p>
          <h1>{restaurant.name}</h1>
          <p className="os-branch-selector-description">
            اختر الفرع الأقرب إلك حتى تشوف المنيو وتطلب مباشرة من الفرع الصحيح.
          </p>
        </div>
        <section className="os-branch-selector-panel" aria-label="فروع المطعم">
          <div className="os-branch-selector-panel-title">
            <div>
              <span className="os-branch-selector-step">01 / اختر الفرع</span>
              <h2>فروعنا</h2>
            </div>
            <span className="os-branch-selector-count">{branches.length} {branches.length === 1 ? "فرع" : "فروع"}</span>
          </div>
          {branches.length === 0 ? (
            <div className="os-branch-selector-empty">
              <Store size={30} />
              <strong>لا يوجد فرع متاح حالياً</strong>
              <p>يرجى المحاولة لاحقاً أو التواصل مع المطعم.</p>
            </div>
          ) : (
            <div className="os-branch-selector-list">
              {branches.map((branch) => (
                <button
                  className="os-branch-selector-item"
                  key={branch.id}
                  type="button"
                  disabled={openingBranch !== null}
                  onClick={() => selectBranch(branch.id)}
                >
                  <span className="os-branch-selector-item-icon"><MapPin size={22} /></span>
                  <span className="os-branch-selector-item-info">
                    <span className="os-branch-selector-item-name">{branch.name}</span>
                    <span className="os-branch-selector-item-address">{[branch.address, branch.city].filter(Boolean).join("، ") || "اطّلع على منيو الفرع"}</span>
                    {branch.id === lastBranchId ? <span className="os-branch-selector-last"><CheckCircle2 size={13} /> آخر فرع اخترته</span> : null}
                  </span>
                  <span className="os-branch-selector-item-chevron" aria-hidden="true">
                    {openingBranch === branch.id ? <span className="os-branch-selector-loading" /> : <ChevronLeft size={21} />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        <p className="os-branch-selector-foot"><ArrowRight size={16} /> يمكن تغيير الفرع لاحقاً من داخل المنيو</p>
      </div>
    </main>
  );
}
