import { clientUuid } from "@/lib/client-uuid";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const temporary = new Map<string, string>();

function tabIdentifier(slug: string) {
  const key = "ordersawa:visit-tab:" + slug;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved && uuid.test(saved)) {
      temporary.set(slug, saved);
      return saved;
    }
  } catch { /* Storage may be disabled. */ }
  const value = temporary.get(slug) ?? clientUuid();
  temporary.set(slug, value);
  try { sessionStorage.setItem(key, value); } catch { /* Keep the in-memory identity. */ }
  return value;
}

export async function visitBrowserId(slug: string): Promise<string> {
  const fallback = temporary.get(slug);
  if (fallback) return fallback;
  try {
    if (typeof indexedDB === "undefined") return tabIdentifier(slug);
    return await new Promise<string>((resolve, reject) => {
      const open = indexedDB.open("ordersawa-visits", 1);
      let expired = false;
      let tx: IDBTransaction | undefined;
      const timeout = setTimeout(() => {
        expired = true;
        try { tx?.abort(); } catch { /* The transaction may already have finished. */ }
        reject(new Error("Storage timeout"));
      }, 1500);
      const fail = () => { clearTimeout(timeout); reject(new Error("Visitor storage unavailable")); };
      open.onupgradeneeded = () => open.result.createObjectStore("browsers");
      open.onerror = fail;
      open.onsuccess = () => {
        const db = open.result;
        if (expired) { db.close(); return; }
        // One read/write transaction serializes first visits from simultaneous tabs.
        try { tx = db.transaction("browsers", "readwrite"); }
        catch { db.close(); fail(); return; }
        const store = tx.objectStore("browsers");
        const read = store.get(slug);
        let value: string;
        read.onsuccess = () => {
          value = read.result;
          if (typeof value !== "string" || !uuid.test(value)) {
            value = clientUuid();
            store.put(value, slug);
          }
        };
        tx.oncomplete = () => { clearTimeout(timeout); db.close(); resolve(value); };
        tx.onabort = () => { db.close(); fail(); };
      };
    });
  } catch { return tabIdentifier(slug); }
}
