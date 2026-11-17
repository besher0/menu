import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });
async function setup() {
  const stored = new Map();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value) });
  vi.stubGlobal('document', { visibilityState: 'visible' });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  const fetcher = vi.fn(async (_url: string, _request: { body: string }) => ({ ok: true, status: 201 })); vi.stubGlobal('fetch', fetcher);
  return { fetcher, track: (await import('./view-tracking')).trackVisibleView };
}
const view = { slug: 'a', type: 'MENU_VIEWED' as const, path: '/m/a/menu' };
describe('visible view delivery', () => {
  it('sends a v4 event ID on HTTP when only getRandomValues is available', async () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(255));
    vi.stubGlobal('crypto', { getRandomValues });
    const { track, fetcher } = await setup();
    track(view);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(getRandomValues).toHaveBeenCalled();
    expect(JSON.parse(fetcher.mock.calls[0][1].body).eventId).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
  it('deduplicates effect remounts and ignores invisible pages', async () => {
    const { track, fetcher } = await setup(); track(view); track(view);
    await Promise.resolve(); expect(fetcher).toHaveBeenCalledTimes(1);
    vi.stubGlobal('document', { visibilityState: 'hidden' }); track({ ...view, slug: 'b' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains the visible product through late remounts and permits a later reopening', async () => {
    vi.useFakeTimers();
    const { track, fetcher } = await setup();
    const product = { slug: 'a', type: 'PRODUCT_VIEWED' as const, path: '/m/a/product/pizza',
      metadata: { productId: 'pizza-id', productSlug: 'pizza' } };
    track(product); await vi.runAllTimersAsync();
    await vi.advanceTimersByTimeAsync(6000);
    track(product); await vi.runAllTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const { leaveTrackedProduct } = await import('./view-tracking');
    leaveTrackedProduct(); track(product); await vi.runAllTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).metadata).toEqual(product.metadata);
  });
  it('retains per-restaurant identities in memory when browser storage is blocked', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('sessionStorage', { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
    const { visitBrowserId } = await import('./visit-browser-id');
    const id = await visitBrowserId('a');
    expect(await visitBrowserId('a')).toBe(id);
    expect(await visitBrowserId('b')).not.toBe(id);
  });
  it('falls back once when opening IndexedDB times out', async () => {
    vi.useFakeTimers();
    await setup();
    const open = vi.fn(() => ({}));
    vi.stubGlobal('indexedDB', { open });
    const { visitBrowserId } = await import('./visit-browser-id');
    const pending = visitBrowserId('a');
    await vi.advanceTimersByTimeAsync(1501);
    expect(await visitBrowserId('a')).toBe(await pending);
    expect(open).toHaveBeenCalledOnce();
  });
  it('retries failures with the same identifier, then acknowledges', async () => {
    vi.useFakeTimers(); const { track, fetcher } = await setup();
    fetcher.mockRejectedValueOnce(new Error('lost acknowledgement')); track(view);
    await vi.runAllTimersAsync(); expect(fetcher).toHaveBeenCalledTimes(2);
    const calls = fetcher.mock.calls as unknown as [string, { body: string }][];
    expect(JSON.parse(calls[0][1].body)).toEqual(JSON.parse(calls[1][1].body));
  });
});
