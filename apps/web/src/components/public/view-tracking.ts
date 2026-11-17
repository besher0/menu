// Best-effort acknowledged view delivery. Bounded tab-local outbox survives
// navigation/reload, not tab closure. No durable/financial delivery guarantee.
import { clientUuid } from "@/lib/client-uuid";
import { visitBrowserId } from "./visit-browser-id";

type View = { slug: string; path: string } & (
  { type: "MENU_VIEWED" } |
  { type: "PRODUCT_VIEWED"; metadata: { productId?: string; productSlug: string } }
);
type Pending = View & { eventId: string; clientId?: string; created: number; attempts: number };
const storageKey = 'ordersawa:view-outbox:v1';
const maxAge = 5 * 60_000;
let queue: Pending[] = [];
let initialized = false;
let running = false;
const recent = new Map<string, number>();

// A component remount within the same product view is not another opening.
let visibleProductPath: string | undefined;
export function leaveTrackedProduct() { visibleProductPath = undefined; }

function save() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(queue)); }
  catch { console.warn('OrderSawa analytics: outbox storage unavailable; memory delivery only'); }
}

async function drain() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    while (queue.length && navigator.onLine) {
      const event = queue[0];
      if (Date.now() - event.created > maxAge || event.attempts >= 3) {
        console.warn('OrderSawa analytics: view delivery exhausted or expired');
        queue.shift(); save(); continue;
      }
      if (event.type === "MENU_VIEWED" && !event.clientId) event.clientId = await visitBrowserId(event.slug);
      event.attempts++; save();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/public/menus/${encodeURIComponent(event.slug)}/track`, {
          method: 'POST', cache: 'no-store', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: event.type, path: event.path, eventId: event.eventId,
            clientId: event.type === "MENU_VIEWED" ? event.clientId : undefined,
            metadata: event.type === "PRODUCT_VIEWED" ? event.metadata : undefined })
        });
        if (response.ok) { queue.shift(); save(); continue; }
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          console.warn('OrderSawa analytics: rejected view event'); queue.shift(); save(); continue;
        }
      } catch { /* Retry with the same id, including when an acknowledgement was lost. */ }
      finally { clearTimeout(timer); }
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** event.attempts));
    }
  } finally { running = false; }
}

export function trackVisibleView(view: View) {
  if (document.visibilityState !== 'visible') return;
  if (!initialized) {
    initialized = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(saved)) queue = saved.filter(e => e && typeof e.slug === 'string' && typeof e.path === 'string'
        && ['MENU_VIEWED','PRODUCT_VIEWED'].includes(e.type) && /^[a-f0-9-]{36}$/i.test(e.eventId)
        && Number.isFinite(e.created) && Number.isInteger(e.attempts) && e.attempts >= 0).slice(0, 32);
    } catch { console.warn('OrderSawa analytics: could not restore view outbox'); }
    window.addEventListener('online', () => { void drain(); });
  }
  const key = `${view.slug}:${view.type}:${view.path}`;
  if (view.type === "PRODUCT_VIEWED" && visibleProductPath === key) { void drain(); return; }
  visibleProductPath = view.type === "PRODUCT_VIEWED" ? key : undefined;
  const now = Date.now();
  for (const [entry, timestamp] of recent) if (now - timestamp >= 5000) recent.delete(entry);
  if (recent.has(key) || queue.some(e => e.slug === view.slug && e.type === view.type && e.path === view.path && now - e.created < 5000)) {
    void drain(); return;
  }
  recent.set(key, now);
  if (queue.length >= 32) { console.warn('OrderSawa analytics: outbox full; view not queued'); return; }
  queue.push({ ...view, eventId: clientUuid(), created: now, attempts: 0 }); save();
  void drain();
}
