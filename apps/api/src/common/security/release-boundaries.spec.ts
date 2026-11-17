import { describe, it, expect, vi } from 'vitest';
import { DashboardController } from '../../modules/dashboard/dashboard.controller';
import { OrdersController } from '../../modules/orders/orders.controller';
import { SyncController } from '../../modules/sync/sync.controller';
import { QrController } from '../../modules/qr/qr.controller';
import { ProductsController } from '../../modules/products/products.controller';
import { PublicMenuService } from '../../modules/public-menu/public-menu.service';
import { validateStagingConfig } from './staging-config';

describe('release authorization boundaries', () => {
  it.each(['EMPLOYEE','EDITOR'])('denies sensitive overview/orders and broad sync to %s before DB access', role => {
    const service = {overview:vi.fn(),list:vi.fn(),create:vi.fn(),retry:vi.fn()};
    const req = {user:{role:'USER'},restaurant:{id:'a',role}} as any;
    expect(()=>new DashboardController(service as any).overview(req)).toThrow();
    expect(()=>new OrdersController(service as any).list(req)).toThrow();
    expect(()=>new SyncController(service as any).list(req)).toThrow();
    expect(()=>new SyncController(service as any).create(req,{} as any)).toThrow();
    expect(()=>new SyncController(service as any).retry(req,'foreign')).toThrow();
    for(const f of Object.values(service)) expect(f).not.toHaveBeenCalled();
  });
  it('retains owner access and denies employee QR mutation', () => {
    const service={overview:vi.fn(),list:vi.fn(),create:vi.fn()};
    const req={user:{role:'USER'},restaurant:{id:'owned',role:'OWNER'}} as any;
    new DashboardController(service as any).overview(req); new OrdersController(service as any).list(req);
    expect(service.overview).toHaveBeenCalledWith('owned', undefined, true, false);expect(service.list).toHaveBeenCalledWith('owned');
    req.restaurant.role='EMPLOYEE';expect(()=>new QrController(service as any).create(req,{} as any)).toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });
  it('does not let an availability-only employee delete a product',()=>{
    const service={delete:vi.fn(),toggleAvailability:vi.fn()};
    const controller=new ProductsController(service as any,{} as any,{} as any);
    const req={user:{role:'USER'},restaurant:{id:'owned',role:'EMPLOYEE'}} as any;
    expect(()=>controller.delete(req,'product')).toThrow();expect(service.delete).not.toHaveBeenCalled();
    controller.toggleAvailability(req,'product');expect(service.toggleAvailability).toHaveBeenCalledWith('owned','product');
  });
  it.each(['WHATSAPP_ORDER_CLICKED','ADD_TO_CART','PAGE_VIEWED','arbitrary',undefined])('rejects client-authored %s before persistence', async type => {
    const findFirst=vi.fn(),create=vi.fn();
    const service=new PublicMenuService({restaurant:{findFirst},analyticsEvent:{create}} as any,{} as any,{} as any);
    await expect(service.track('a',{type},'Mozilla/5.0')).rejects.toMatchObject({status:400});
    expect(findFirst).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
  });
});

describe('staging deployment boundary',()=>{
  const fixture=()=>({ORDERSAWA_ENV:'staging',NODE_ENV:'production',STAGING_DB_HOST:'127.0.0.1',STAGING_DB_PORT:'5432',STAGING_DB_NAME:'ordersawa_staging',
    DATABASE_URL:'postgresql://stage:'+encodeURIComponent('generated-test-value')+'@127.0.0.1:5432/ordersawa_staging',
    DIRECT_URL:'postgresql://stage:'+encodeURIComponent('generated-test-value')+'@127.0.0.1:5432/ordersawa_staging',
    WEB_ORIGIN:'https://staging.example.test',API_ORIGIN:'https://staging.example.test/api',CORS_ORIGINS:'https://staging.example.test',NEXT_PUBLIC_WEB_URL:'https://staging.example.test',NEXT_PUBLIC_API_URL:'/api',ORDERSAWA_PREVIEW_INTERNAL_API_URL:'http://127.0.0.1:5000',ROOT_DOMAIN:'staging.example.test',NEXT_PUBLIC_ROOT_DOMAIN:'staging.example.test',INTERNAL_RESTAURANT_REWRITE_SECRET:'a'.repeat(40),TRUST_PROXY:'127.0.0.1',API_HOST:'127.0.0.1',ORDERSAWA_RELEASE_ID:'staging-fixture'});
  it('accepts the explicit staging target',()=>expect(()=>validateStagingConfig(fixture())).not.toThrow());
  it.each([{STAGING_DB_NAME:'production'},{DATABASE_URL:'postgresql://stage@127.0.0.1/production'},{DIRECT_URL:'postgresql://stage@elsewhere/ordersawa_staging'},{CORS_ORIGINS:'*'},{ORDERSAWA_PREVIEW_INTERNAL_API_URL:'https://production.example.test'},{NODE_ENV:'development'},{TRUST_PROXY:'true'},{ORDERSAWA_RELEASE_ID:'20261116T000000Z-aaaaaaaaaaaa'},{INTERNAL_RESTAURANT_REWRITE_SECRET:''},{ENABLE_DISPOSABLE_NETWORK_ORDERS:'1'}])('rejects unsafe staging inputs (%#)',change=>expect(()=>validateStagingConfig({...fixture(),...change})).toThrow());
  it('does not change existing non-staging deployments',()=>expect(()=>validateStagingConfig({NODE_ENV:'production'})).not.toThrow());
});
