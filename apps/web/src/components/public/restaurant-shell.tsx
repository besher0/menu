"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getPublicMenu, getPublicProductConfiguration, isPublicMenuNotFoundError, type PublicMenuData } from "@/lib/api";
import { publicMenuMetadata } from "@/lib/public-menu-metadata";
import { PublicMenuClient } from "./public-menu-client";
import { RestaurantShellContext } from "./restaurant-shell-context";
import { findSnapshotProduct, restaurantRoute, RestaurantConfigurationCache, snapshotScope, validSnapshot } from "./restaurant-shell-model";
import { rememberPublicNavigation } from "./public-history";

const freshnessMs = 60_000;

export function RestaurantShell({ initialData, shortRoutes, testEnabled, children }: {
  initialData: PublicMenuData; shortRoutes: boolean; testEnabled: boolean; children: ReactNode;
}) {
  const pathname = usePathname();
  const tenant = initialData.restaurant.slug;
  const route = restaurantRoute(pathname, tenant, shortRoutes);
  const [snapshot, setSnapshot] = useState(initialData);
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  const [status, setStatus] = useState<"ready" | "stale" | "pending" | "unavailable" | "scope-changed">("ready");
  const [configurations] = useState(() => new RestaurantConfigurationCache(tenant, async (slug, id) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try { return await getPublicProductConfiguration(slug, id, controller.signal); }
    finally { clearTimeout(timer); }
  }));
  const held = useRef(0);
  const deferred = useRef<PublicMenuData | null>(null);
  const lastMenu = useRef<{ href: string; scroll: number } | null>(null);
  const alive = useRef(true);
  const container = useRef<HTMLDivElement>(null);
  const previousPath = useRef(pathname);
  const applySnapshot = useCallback((value: PublicMenuData) => {
    // No catalog revision currently covers linked dependencies. Invalidate all
    // eight bounded configurations after a successful catalog refresh instead.
    configurations.clear();
    if (snapshotScope(value) !== snapshotScope(snapshotRef.current)) {
      // Never reinterpret an in-memory cart/selection in a new currency or
      // silently run the existing persisted-cart restore with a different scope.
      setStatus("scope-changed"); return;
    }
    setSnapshot(value); setStatus("ready");
  }, [configurations]);
  const holdSnapshot = useCallback(() => {
    held.current++;
    let released = false;
    return () => {
      if (released) return; released = true; held.current--;
      if (!held.current && deferred.current && alive.current) {
        const value = deferred.current; deferred.current = null; applySnapshot(value);
      }
    };
  }, [applySnapshot]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false, busy = false, lastAttempt = Date.now();
    let activeRequest: AbortController | null = null;
    async function refresh() {
      if (cancelled || busy || document.visibilityState !== "visible" || !navigator.onLine || Date.now() - lastAttempt < freshnessMs) return;
      busy = true; lastAttempt = Date.now();
      const controller = new AbortController(); activeRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const value = await getPublicMenu(tenant, controller.signal);
        if (cancelled) return;
        if (!validSnapshot(value, tenant)) throw new Error("Public snapshot scope mismatch");
        // Preserve object identity and avoid a catalog render/notification for
        // an unchanged public representation. This is NOT a dependency revision:
        // configuration caches are invalidated even when summaries are identical.
        if (JSON.stringify(value) === JSON.stringify(snapshotRef.current)) {
          deferred.current = null; configurations.clear(); setStatus("ready"); return;
        }
        if (held.current) { deferred.current = value; configurations.clear(); setStatus("pending"); }
        else applySnapshot(value);
      } catch (error) {
        if (!cancelled) {
          deferred.current = null;
          setStatus(current => isPublicMenuNotFoundError(error) ? "unavailable"
            : current === "unavailable" || current === "scope-changed" ? current : "stale");
          configurations.clear();
        }
      } finally { busy = false; activeRequest = null; window.clearTimeout(timeout); }
    }
    const offline = () => setStatus(current => current === "unavailable" || current === "scope-changed" ? current : "stale");
    const timer = window.setInterval(() => void refresh(), freshnessMs);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    window.addEventListener("offline", offline); document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true; alive.current = false; activeRequest?.abort(); window.clearInterval(timer); configurations.clear();
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", refresh);
    };
  }, [tenant, configurations, applySnapshot]);

  const navigate = useCallback((href: string, replace = false) => {
    if (!href.startsWith("/") || href.startsWith("//") || /[\\\u0000-\u001f]/.test(href)) return false;
    const url = new URL(href, window.location.href);
    const target = restaurantRoute(url.pathname, tenant, shortRoutes);
    const current = restaurantRoute(window.location.pathname, tenant, shortRoutes);
    if (!target || !current || url.origin !== location.origin || url.hash) return false;
    // Unknown products keep the server route's not-available behavior and read.
    if (target.view === "product" && !findSnapshotProduct(snapshotRef.current, target.productSlug)) return false;
    if (current.view === "menu") lastMenu.current = { href: location.pathname + location.search, scroll: scrollY };
    let targetHref = url.pathname + url.search;
    let restoreScroll: number | undefined;
    if (target.view === "menu" && !url.search && current.view !== "menu" && lastMenu.current) {
      targetHref = lastMenu.current.href; restoreScroll = lastMenu.current.scroll;
    }
    if (targetHref === location.pathname + location.search) return true;
    rememberPublicNavigation(targetHref, tenant, restoreScroll);
    // The documented Next native-history integration updates pathname/search.
    // Never set or inspect private Next router tree fields.
    if (replace) window.history.replaceState(null, "", targetHref);
    else window.history.pushState(null, "", targetHref);
    return true;
  }, [tenant, shortRoutes]);
  const context = useMemo(() => ({ navigate, configurations, holdSnapshot }), [navigate, configurations, holdSnapshot]);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const main = container.current?.querySelector<HTMLElement>("main:not([hidden])");
    if (main) { main.tabIndex = -1; main.focus({ preventScroll: true }); }
  }, [pathname]);

  useEffect(() => {
    if (!route) return;
    const meta = publicMenuMetadata(snapshot, route);
    document.title = meta.title as string;
    const setMeta = (attr: "name" | "property", name: string, content?: string | null) => {
      const old = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
      if (!content) { old?.remove(); return; }
      const element = old ?? document.createElement("meta"); element.setAttribute(attr, name); element.content = content;
      if (!old) document.head.appendChild(element);
    };
    setMeta("name", "description", meta.description);
    setMeta("property", "og:title", meta.title as string); setMeta("property", "og:description", meta.description);
    const canonical = meta.alternates?.canonical as string;
    setMeta("property", "og:url", canonical);
    const image = (meta.openGraph?.images as string[] | undefined)?.[0]; setMeta("property", "og:image", image);
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.createElement("link");
    link.rel = "canonical"; link.href = canonical; if (!link.parentNode) document.head.appendChild(link);
  }, [pathname, snapshot]);

  // Other Next pages (including the guarded isolated order-test page) remain
  // server-routed. A foreign tenant is never rendered from this snapshot.
  if (!route) return children;
  if (status === "unavailable") return <main role="alert">المنيو غير متاحة حاليًا / Menu currently unavailable</main>;
  if (status === "scope-changed") return <main role="alert">
    <p>تغيرت عملة المطعم. أعد تحميل المنيو وراجع السلة قبل الطلب. / Restaurant currency changed. Reload and review the cart before ordering.</p>
    <button type="button" onClick={() => window.location.reload()}>إعادة تحميل المنيو / Reload menu</button>
  </main>;
  return <RestaurantShellContext.Provider value={context}>
    <div ref={container} className="public-page" data-restaurant-shell={tenant} data-snapshot-scope={snapshotScope(snapshot)}>
      {status === "stale" ? <p role="status">تعذر تحديث المنيو؛ الأسعار والتوفر تُراجع عند الطلب. / Menu refresh unavailable; prices are verified at checkout.</p> : null}
      {status === "pending" ? <p role="status">توجد بيانات أحدث؛ ستُعرض بعد مغادرة التكوين أو السلة. / Updated menu available after leaving the configuration or cart.</p> : null}
      <PublicMenuClient data={snapshot} view={route.view} productSlug={route.productSlug} initialUseSubdomainRoutes={shortRoutes} />
      {testEnabled && route.view === "cart" ? <aside className="network-order-test-entry">
        <Link href={`/m/${encodeURIComponent(tenant)}/network-order-test`}>تجربة الطلب المعزولة — دون إرسال WhatsApp</Link>
      </aside> : null}
    </div>
  </RestaurantShellContext.Provider>;
}
