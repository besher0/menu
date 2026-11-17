import { describe, expect, it, vi } from 'vitest';
import { PublicMenuService } from './public-menu.service';

function fixture() {
  const db = { restaurant: { findFirst: vi.fn(async () => ({ id: 'a' })) }, product: { findFirst: vi.fn(async () => ({id:'p',slug:'pizza'})) }, analyticsEvent: { create: vi.fn(async (arg: any) => ({ id: arg.data.id })) }, menu: { findMany: vi.fn(async () => []) } };
  const service = new PublicMenuService(db as any, { listFeatures: async () => [], canUseAssignedFeature: async () => false } as any, {} as any);
  const event = { type: 'PRODUCT_VIEWED', path: '/m/a/product/pizza', eventId: '11111111-1111-4111-8111-111111111111' };
  return { db, service, event };
}
describe('P0 independent acknowledged views', () => {
  it('never writes analytics on a menu read even with legacy tracking enabled', async () => {
    const { db, service } = fixture();
    db.analyticsEvent.create.mockRejectedValue(new Error('offline'));
    vi.spyOn(service as any, 'findPublicRestaurant').mockResolvedValue({ id: 'a', categories: [], products: [] });
    vi.spyOn(service as any, 'serializeRestaurant').mockReturnValue({});
    vi.spyOn(service as any, 'serializeProducts').mockResolvedValue([]);
    vi.spyOn(service as any, 'serializePublicThemeSettings').mockReturnValue({});
    await expect(service.menu('a', 'Mozilla', true)).resolves.toHaveProperty('products', []);
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });
  it('rejects bot traffic before any database work', async () => {
    const { db, service, event } = fixture();
    await expect(service.track('a', event, 'Googlebot')).resolves.toEqual({ ignored: true });
    expect(db.restaurant.findFirst).not.toHaveBeenCalled();
  });
  it('uses stable tenant-scoped ids and acknowledges a duplicate', async () => {
    const { db, service, event } = fixture();
    const first = await service.track('a', event, 'Mozilla');
    if (!("id" in first)) throw new Error("Expected an acknowledged product view");
    db.analyticsEvent.create.mockRejectedValueOnce({ code: 'P2002' });
    expect(await service.track('a', event, 'Mozilla')).toEqual({ id: first.id, duplicate: true });
    db.restaurant.findFirst.mockResolvedValueOnce({ id: 'b' });
    const second = await service.track('b', { ...event, path: '/m/b/product/pizza' }, 'Mozilla');
    if (!("id" in second)) throw new Error("Expected the second tenant's view");
    expect(second.id).not.toBe(first.id);
  });
  it('reports persistence failure and releases its concurrency slot', async () => {
    const { db, service, event } = fixture();
    db.analyticsEvent.create.mockRejectedValueOnce(new Error('offline'));
    await expect(service.track('a', event, 'Mozilla')).rejects.toMatchObject({ status: 503 });
    await expect(service.track('a', event, 'Mozilla')).resolves.toHaveProperty('id');
    expect((service as any).pendingAnalytics).toBe(0);
  });
  it('rejects view events without a retry identifier and malformed scalar fields before querying', async () => {
    const {db,service,event} = fixture();
    for (const payload of [{...event,eventId:undefined},{...event,path:1},{...event,metadata:"invalid"}]) {
      await expect(service.track('a',payload as typeof event)).rejects.toMatchObject({status:400});
    }
    expect(db.restaurant.findFirst).not.toHaveBeenCalled();
  });
  it('rejects overload and foreign paths without querying', async () => {
    const { db, service, event } = fixture();
    await expect(service.track('a', { ...event, path: '/m/b' })).rejects.toMatchObject({ status: 400 });
    (service as any).pendingAnalytics = 32;
    await expect(service.track('a', event)).rejects.toMatchObject({ status: 503 });
    expect(db.restaurant.findFirst).not.toHaveBeenCalled();
  });
});
