// Only a same-tab public transition authorizes back; `from`/history.length do not.
const key = 'ordersawaPublicEntry';
type Entry = { tenant: string; href: string; previous?: string; scroll?: number };
let pending: { tenant: string; target: string; from: string; scroll?: number } | null = null;
const here = () => location.pathname + location.search;
export function isRestaurantHref(href: string, slug: string, pathBased: boolean) {
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\u0000-\u001f]/.test(href)) return false;
  const url = new URL(href, 'https://ordersawa.invalid');
  const base = pathBased ? `/m/${slug}` : '';
  return url.pathname === (base || '/') || url.pathname === `${base}/menu` || url.pathname === `${base}/cart`
    || url.pathname.startsWith(`${base}/product/`);
}
export function rememberPublicNavigation(href: string, tenant: string, restoreScroll?: number) {
  const current = here();
  const pathBased = location.pathname.startsWith(`/m/${tenant}`);
  if (!isRestaurantHref(current, tenant, pathBased) || !isRestaurantHref(href, tenant, pathBased) || current === href) return;
  const old = history.state?.[key] as Entry | undefined;
  history.replaceState({ ...history.state, [key]: { ...(old?.tenant === tenant ? old : {}), tenant, href: current, scroll: window.scrollY } }, '', current);
  pending = { tenant, target: href, from: current, scroll: restoreScroll };
}
export function commitPublicNavigation(tenant: string) {
  const current = here();
  let entry = history.state?.[key] as Entry | undefined;
  if (pending?.tenant === tenant && pending.target === current) {
    entry = { tenant, href: current, previous: pending.from, scroll: pending.scroll }; pending = null;
  } else if (entry?.tenant !== tenant || entry.href !== current) entry = { tenant, href: current };
  history.replaceState({ ...history.state, [key]: entry }, '', current);
  return entry.scroll;
}
export function hasSavedPublicScroll() { return Number.isFinite(history.state?.[key]?.scroll); }
export function returnFromPublicProduct(tenant: string, fallback: string, router: { back(): void; replace(href: string): void }) {
  const pathBased = location.pathname.startsWith(`/m/${tenant}`);
  const entry = history.state?.[key] as Entry | undefined;
  pending = null;
  if (entry?.tenant === tenant && entry.href === here() && entry.previous && isRestaurantHref(entry.previous, tenant, pathBased)) router.back();
  else router.replace(isRestaurantHref(fallback, tenant, pathBased) && new URL(fallback, location.href).pathname !== location.pathname
    ? fallback : pathBased ? `/m/${tenant}/menu` : '/menu');
}
