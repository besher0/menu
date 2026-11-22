import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitPublicNavigation, isRestaurantHref, rememberPublicNavigation, replaceMenuQuery, saveMenuPosition, returnFromPublicProduct } from './public-history';
afterEach(() => vi.unstubAllGlobals());
function fixture(path = '/m/a/menu', search = '?category=pizza&display=list') {
  const location = { pathname: path, search, href: `https://ordersawa.test${path}${search}` };
  const history = { state: {} as any, replaceState: vi.fn((state: any) => { history.state = state; }) };
  vi.stubGlobal('location', location); vi.stubGlobal('history', history); vi.stubGlobal('window', { scrollY: 410 });
  return { location, history, router: { back: vi.fn(), replace: vi.fn() } };
}
describe('public product history', () => {
  it('backs for a proven internal transition and retains scroll/query', () => {
    const { location, history, router } = fixture();
    rememberPublicNavigation('/m/a/product/p', 'a');
    expect(history.state.ordersawaPublicEntry.scroll).toBe(410);
    location.pathname = '/m/a/product/p'; location.search = '';
    history.state = {}; commitPublicNavigation('a');
    returnFromPublicProduct('a', '/m/a/menu', router);
    expect(router.back).toHaveBeenCalledOnce(); expect(router.replace).not.toHaveBeenCalled();
  });
  it('replaces direct URLs without adding loops and rejects foreign fallbacks', () => {
    const { router } = fixture('/m/a/product/p', '?from=forged'); commitPublicNavigation('a');
    returnFromPublicProduct('a', '/m/b/menu', router);
    expect(router.replace).toHaveBeenCalledWith('/m/a/menu'); expect(router.back).not.toHaveBeenCalled();
    for (const href of ['//evil.test', '/\\evil.test', '/dashboard', '/m/b/menu']) expect(isRestaurantHref(href, 'a', true)).toBe(false);
  });
});

describe('menu scroll synchronization', () => {
  it('updates the same entry, preserving unrelated state, navigation ancestry, query and fragment', () => {
    const { history } = fixture();
    history.state = { other: 5, ordersawaPublicEntry: { id: 'entry', tenant: 'a', href: '/m/a/menu', previous: '/m/a', scroll: 280 } };
    replaceMenuQuery(new URL('https://ordersawa.test/m/a/menu?keep=1&category=all#summary'), 'a');
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.replaceState.mock.calls[0][0]).toMatchObject({
      other: 5, ordersawaPublicEntry: { id: 'entry', tenant: 'a', previous: '/m/a', href: '/m/a/menu?keep=1&category=all', scroll: undefined }
    });
    expect(history.replaceState.mock.lastCall).toHaveLength(3);
    expect((history.replaceState.mock.lastCall as unknown[])[2]).toBe('/m/a/menu?keep=1&category=all#summary');
  });

  it('replaces a previous offset when scrolling inside the same category', () => {
    const { history, location } = fixture();
    const href = location.pathname + location.search;
    history.state = { ordersawaPublicEntry: { id: 'one', tenant: 'a', href, scroll: 207 } };
    const setItem = vi.fn();
    vi.stubGlobal('sessionStorage', { setItem });
    saveMenuPosition('a', 82);
    expect(history.state.ordersawaPublicEntry.scroll).toBe(82);
    expect(JSON.parse(setItem.mock.calls[0][1])).toMatchObject({ tenant: 'a', id: 'one', href, y: 82 });
    saveMenuPosition('b', 100);
    expect(history.replaceState).toHaveBeenCalledTimes(1);
  });

  it('skips a redundant URL update', () => {
    const { location, history } = fixture();
    replaceMenuQuery(new URL(location.href), 'a');
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
