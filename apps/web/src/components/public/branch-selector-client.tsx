"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Store } from "lucide-react";
import type { PublicBranchesData } from "@/lib/api";
import { isRestaurantSubdomainHost, restaurantPath } from "@/lib/public-routes";
import styles from "./branch-selector.module.css";

type Restaurant = PublicBranchesData["restaurant"];

export function BranchSelectorClient({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const branches = restaurant.branches ?? [];
  const [openingBranch, setOpeningBranch] = useState<string | null>(null);

  function branchHref(id: string) {
    const subdomain = isRestaurantSubdomainHost(window.location.host, restaurant.slug);
    return `${restaurantPath(restaurant.slug, "/", subdomain)}?selectedBranch=${encodeURIComponent(id)}`;
  }

  useEffect(() => {
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
      // Branch selection works when browser storage is unavailable.
    }
    router.push(branchHref(id));
  }

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.container}>
        <header className={styles.cover}>
          {restaurant.heroImageUrl ? (
            <img className={styles.coverImage} src={restaurant.heroImageUrl} alt="" />
          ) : (
            <div className={styles.coverFallback} />
          )}
        </header>
        <div className={styles.identity}>
          {restaurant.logoUrl ? (
            <img className={styles.logo} src={restaurant.logoUrl} alt={restaurant.name} />
          ) : (
            <div className={styles.logoFallback}><Store size={42} aria-hidden="true" /></div>
          )}
          <h1>أهلاً وسهلاً في <bdi>{restaurant.name}</bdi></h1>
          <p>اختر الفرع الأقرب إليك لتصفح القائمة</p>
        </div>
        <section className={styles.branches} aria-label="اختر فرع المطعم">
          {branches.length === 0 ? (
            <p className={styles.empty}>لا توجد فروع متاحة حالياً.</p>
          ) : branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={styles.card}
              disabled={openingBranch !== null}
              onClick={() => selectBranch(branch.id)}
              aria-label={`تصفح منيو ${branch.name}`}
            >
              <div className={styles.photo}>
                {branch.imageUrl || restaurant.heroImageUrl ? (
                  <img
                    loading="lazy"
                    src={branch.imageUrl || restaurant.heroImageUrl || ""}
                    alt={`واجهة ${branch.name}`}
                  />
                ) : (
                  <div className={styles.photoFallback}><Store size={48} aria-hidden="true" /></div>
                )}
              </div>
              <div className={styles.cardInfo}>
                <h2>{branch.name}</h2>
                <div className={styles.cardBottom}>
                  <span className={styles.address}>{[branch.address, branch.city].filter(Boolean).join("، ") || "تصفح قائمة الفرع"}</span>
                  <span className={styles.view}>
                    {openingBranch === branch.id ? "جاري الفتح..." : "تصفح المنيو"}
                    <ChevronLeft size={22} strokeWidth={2.3} aria-hidden="true" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
