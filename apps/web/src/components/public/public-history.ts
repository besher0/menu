// Only a same-tab public transition authorizes back; `from`/history.length do not.
const key = 'ordersawaPublicEntry';
type Entry = { tenant: string; href: string; previous?: string; scroll?: number; id?: string };
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
// The session checkpoint belongs to one history entry in one tab. Save at rest or on
// departure, including when moving within the same category.
const checkpointKey = 'ordersawa:menu-position';
const validScroll = (y: unknown): y is number => typeof y === 'number' && Number.isFinite(y) && y >= 0;
let firstCommit = true;
function reloadCheckpoint(entry: Entry | undefined) {
  if (!firstCommit || !entry?.id || entry.href !== here()
      || (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type !== 'reload') return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(checkpointKey) ?? 'null');
    if (saved?.id === entry.id && saved.tenant === entry.tenant && saved.href === entry.href && validScroll(saved.y)) return saved.y as number;
  } catch { /* Storage is optional. */ }
  if (window.scrollY > 0) return window.scrollY;
}
export function commitPublicNavigation(tenant: string) {
  const current = here();
  let entry = history.state?.[key] as Entry | undefined;
  if (pending?.tenant === tenant && pending.target === current) {
    const scroll = pending.scroll ?? (new URLSearchParams(location.search).has('category') ? undefined : 0);
    entry = { tenant, href: current, previous: pending.from, scroll }; pending = null;
  } else if (entry?.tenant !== tenant || entry.href !== current) entry = { tenant, href: current };
  const checkpoint = reloadCheckpoint(entry);
  if (checkpoint !== undefined) entry = { ...entry, scroll: checkpoint };
  firstCommit = false;
  entry = { ...entry, id: entry.id ?? (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) };
  history.replaceState({ ...history.state, [key]: entry }, '', location.href);
  return validScroll(entry.scroll) ? entry.scroll : undefined;
}
export function hasSavedPublicScroll(tenant: string) {
  const entry = history.state?.[key] as Entry | undefined;
  return entry?.tenant === tenant && entry.href === here() && (validScroll(entry.scroll) || reloadCheckpoint(entry) !== undefined);
}
export function saveMenuPosition(tenant: string, observedY: number) {
  const entry = history.state?.[key] as Entry | undefined;
  if (!entry?.id || entry.tenant !== tenant || entry.href !== here()) return;
  const y = Math.max(0, observedY);
  if (!validScroll(y)) return;
  if (entry.scroll !== y) history.replaceState({ ...history.state, [key]: { ...entry, scroll: y } }, '', location.href);
  try {
    sessionStorage.setItem(checkpointKey, JSON.stringify({ tenant, href: entry.href, id: entry.id, y }));
  } catch { /* Native restoration remains available. */ }
}
export function replaceMenuQuery(url: URL, tenant: string) {
  if (url.href === location.href) return;
  const entry = history.state?.[key] as Entry | undefined;
  const href = url.pathname + url.search;
  history.replaceState({ ...history.state, [key]: {
    ...(entry?.tenant === tenant ? entry : {}), tenant, href, scroll: undefined
  } }, '', href + url.hash);
}
export function returnFromPublicProduct(tenant: string, fallback: string, router: { back(): void; replace(href: string): void }) {
  const pathBased = location.pathname.startsWith(`/m/${tenant}`);
  const entry = history.state?.[key] as Entry | undefined;
  pending = null;
  if (entry?.tenant === tenant && entry.href === here() && entry.previous && isRestaurantHref(entry.previous, tenant, pathBased)) router.back();
  else router.replace(isRestaurantHref(fallback, tenant, pathBased) && new URL(fallback, location.href).pathname !== location.pathname
    ? fallback : pathBased ? `/m/${tenant}/menu` : '/menu');
}
