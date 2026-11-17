import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitPublicNavigation, isRestaurantHref, rememberPublicNavigation, returnFromPublicProduct } from './public-history';
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
