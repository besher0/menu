import { FeedbackService } from "../feedback/feedback.service";
import { FeedbackIpGuard, PublicFeedbackController, DashboardFeedbackController } from "../feedback/feedback.module";
import "reflect-metadata";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { AuthController } from "../auth/auth.controller";
import { AuthService } from "../auth/auth.service";
import { PRODUCT_IMPORT_COLUMNS } from "../products/import/product-import-parser";
import { randomBytes, randomUUID, randomInt } from "node:crypto";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { Module, ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Prisma, PrismaClient } from "@prisma/client";
import { ABO_MALEK_THEME, type ProductSelectionV2, type ProductConfigurationV2, type SaveProductEditor } from "@menu/shared";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { ProductsController } from "../products/products.controller";
import { ProductsService } from "../products/products.service";
import { ProductEditorService } from "../products/product-editor.service";
import { ProductsImportService } from "../products/products-import.service";
import { ProductConfigurationService } from "../products/product-configuration.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { credentialVersion } from "../../common/security/session-credential";
import { ApiResponseInterceptor } from "../../common/api-response.interceptor";
import { PublicMenuController } from "./public-menu.controller";
import { PublicMenuService } from "./public-menu.service";
import { PublicWhatsappCheckoutService } from "./public-whatsapp-checkout.service";
import { DashboardController } from "../dashboard/dashboard.controller";
import { DashboardService } from "../dashboard/dashboard.service";
import { BuilderController } from "../builder/builder.controller";
import { BuilderService } from "../builder/builder.service";
import { MediaController } from "../media/media.controller";
import { MediaService } from "../media/media.service";
import { MediaStorageService } from "../media/media-storage.service";
import { ProductLibraryService } from "../media/product-library.service";
import { MediaWriteGuard } from "../media/media-write.guard";
import { orderingFixturesV2 } from "./testing/ordering-v2.fixtures";

const url=process.env.ORDERING_TEST_DATABASE_URL;
const clone=<T,>(x:T):T=>structuredClone(x);
export function pizzaSelection(size="pizza-small"):ProductSelectionV2 {return {schemaVersion:2,productId:"ordering-pizza",configurationRevision:1,groups:[
 {type:"SIZE",groupId:"pizza-size",sizeChoiceId:size,children:[{type:"OPTIONS",groupId:"bake",instances:[{instanceId:"bake-1",optionId:"extra-bake"}]}]},
 {type:"OPTIONS",groupId:"extras",instances:[{instanceId:"cheese-1",optionId:"cheese",children:[{type:"OPTIONS",groupId:"cheese-finish",instances:[{instanceId:"garlic-1",optionId:"garlic"}]}]},{instanceId:"mushroom-1",optionId:"mushroom"}]}]};}
export function comboSelection():ProductSelectionV2 {return {schemaVersion:2,productId:"ordering-combo",configurationRevision:1,groups:[
 {type:"OPTIONS",groupId:"components",instances:[1,2].map(n=>({instanceId:"custom-"+n,optionId:"custom-component",linkedSelection:{schemaVersion:2,productId:"ordering-ordinary",configurationRevision:1,groups:[{type:"SIZE",groupId:"custom-size",sizeChoiceId:"custom-small"}]},children:n===1?[{type:"OPTIONS",groupId:"unit-sauce",instances:[{instanceId:"bbq-1",optionId:"bbq",children:[{type:"OPTIONS",groupId:"spice",instances:[{instanceId:"mild-1",optionId:"mild"}]}]}]}]:[]})),children:[{type:"OPTIONS",groupId:"shared-gift",instances:[1,2].map(n=>({instanceId:"gift-"+n,optionId:"gift"}))}]},
 {type:"OPTIONS",groupId:"anonymous",instances:[{instanceId:"wrap-1",optionId:"wrap"}]}]};}

// Empty normal test environments are explicitly skipped; the acceptance runner requires and verifies its own cluster.
describe.skipIf(!url)("V2 customer ordering / fresh PostgreSQL + authenticated real HTTP",()=>{
 const prisma=new PrismaClient({datasourceUrl:url});let app:INestApplication,origin:string,owner:string;
 const oldFlag=process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT,oldKey=process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY;
 const f=orderingFixturesV2();
 const headers=()=>({"content-type":"application/json",authorization:"Bearer "+owner,"x-restaurant-id":"ordering-restaurant"});
 async function http(path:string,body?:unknown,method=body===undefined?"GET":"POST",auth=false){const r=await fetch(origin+path,{method,headers:auth?headers():{"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await r.json();return {status:r.status,body:raw.data??raw};}
 const quote=(selection:unknown,id="ordering-pizza",extra={})=>http(`/public/menus/ordering-restaurant/products/${id}/quote`,{selection,...extra});
 const prepare=(request:unknown,slug="ordering-restaurant")=>http(`/public/menus/${slug}/checkout/whatsapp/prepare`,request);
 const confirm=(request:unknown,acceptanceToken:string,idempotencyKey=randomUUID())=>http('/public/menus/ordering-restaurant/checkout/whatsapp/confirm',{request,acceptanceToken,idempotencyKey});
 const line=(selection=pizzaSelection(),quantity=1)=>({mode:"NETWORK",lineId:"pizza-line",productId:"ordering-pizza",selection,quantity,expectedUnitPrice:"12750"});
 const ordinary={mode:"LEGACY",lineId:"ordinary-line",productId:"ordering-ordinary",productSlug:"ordering-ordinary",quantity:2,expectedUnitPrice:"200"};
 const request=(items:unknown[]=[line()],extra={})=>({locale:"ar",fulfillmentType:"pickup",customerName:"Synthetic QA",items,...extra});
 async function save(id:string,configuration:ProductConfigurationV2|undefined,name:string){const input:SaveProductEditor={create:true,expectedProductVersion:0,expectedConfigurationVersion:0,product:{name,description:"DEMO isolated ordering",categoryId:"ordering-category",basePrice:configuration?.basePrice??"200",isNew:false,isFeatured:false,isPopular:false,moodKeys:[],images:[{url:"/assets/public/demo-pizza-cheese.jpg",altText:"DEMO"}],ingredients:[],mealDetails:[]},...(configuration?{configuration}:{})};const r=await http('/dashboard/products/'+id+'/editor',input,'PUT',true);expect(r.status,JSON.stringify(r.body)).toBe(200);if(configuration){const toggle=await http('/dashboard/products/'+id+'/toggle-availability',{},'PATCH',true);expect(toggle.status,JSON.stringify(toggle.body)).toBe(200);}return r.body;}
 async function updateTree(id:string,change:(c:ProductConfigurationV2)=>void){const current=(await http('/dashboard/products/'+id+'/editor',undefined,'GET',true)).body;const config=clone(current.configuration);config.revision=current.configurationVersion+1;change(config);const r=await http('/dashboard/products/'+id+'/editor',{create:false,expectedProductVersion:current.editVersion,expectedConfigurationVersion:current.configurationVersion,product:{...current.product,basePrice:config.basePrice},configuration:config},'PUT',true);expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body;}
 beforeAll(async()=>{
  if(!url)throw Error('Explicit owned PostgreSQL required');const u=new URL(url);
  if(u.hostname!=='127.0.0.1'||u.port!==process.env.ORDERING_TEST_PORT||!/^\/ordering_v2_[a-f0-9]+$/.test(u.pathname))throw Error('Refusing non-disposable PostgreSQL');
  const info=await prisma.$queryRawUnsafe<Array<{data_directory:string}>>('SHOW data_directory');
  if(info[0].data_directory.replaceAll('\\','/').toLowerCase()!==process.env.ORDERING_TEST_DATA_DIRECTORY?.replaceAll('\\','/').toLowerCase())throw Error('PostgreSQL identity mismatch');
  process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT='1';process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY=randomBytes(32).toString('hex');
  await prisma.restaurant.createMany({data:[{id:'ordering-restaurant',slug:'ordering-restaurant',name:'DEMO مطعم V2',currency:'SYP',whatsappPhone:'12025550123'},{id:'ordering-other',slug:'ordering-other',name:'Synthetic other',currency:'USD',whatsappPhone:'12025550124'}]});
  await prisma.category.create({data:{id:'ordering-category',restaurantId:'ordering-restaurant',slug:'ordering-category',name:'DEMO V2'}});
  await prisma.restaurantThemeSettings.create({data:{restaurantId:'ordering-restaurant',settings:{...ABO_MALEK_THEME,dashboardSettings:{showPrices:true,deliveryFee:'1500'},publicUi:{...ABO_MALEK_THEME.publicUi,whatsappOrderingEnabled:true}}}});
  await prisma.subscriptionPlan.create({data:{id:'ordering-plan',key:'ORDERING_TEST',name:'Synthetic',features:{create:['PRODUCT_CONFIGURATION','CART_ORDERING','WHATSAPP_ORDERING','PRODUCT_IMAGES','PRODUCT_3D_VIEWER','CUSTOM_THEMES','DRAFT_PUBLISH'].map(key=>({key,enabled:true}))}}});
  await prisma.restaurantSubscription.createMany({data:['ordering-restaurant','ordering-other'].map(restaurantId=>({restaurantId,planId:'ordering-plan',status:'ACTIVE',startsAt:new Date()}))});
  const hash=randomBytes(32).toString('hex');await prisma.user.create({data:{id:'ordering-owner',email:'owner@ordering.invalid',passwordHash:hash}});await prisma.restaurantMember.create({data:{userId:'ordering-owner',restaurantId:'ordering-restaurant',role:'OWNER'}});
  await prisma.menu.create({data:{restaurantId:'ordering-restaurant',name:'DEMO V2',slug:'ordering-menu',pages:{create:{title:'DEMO V2',slug:'home',isHome:true}}}});
  @Module({imports:[JwtModule.register({secret:randomBytes(32).toString('hex'),signOptions:{expiresIn:'1h'}})],controllers:[PublicFeedbackController,DashboardFeedbackController,ProductsController,PublicMenuController,DashboardController,BuilderController,MediaController,AuthController],providers:[FeedbackIpGuard,FeedbackService,JwtAuthGuard,RestaurantContextGuard,ProductEditorService,ProductsService,ProductLibraryService,DashboardService,BuilderService,MediaService,MediaStorageService,MediaWriteGuard,AuthService,FeatureFlagsService,PublicMenuService,PublicWhatsappCheckoutService,{provide:PrismaService,useValue:prisma},{provide:ConfigService,useValue:{get:(key:string)=>key==='JWT_SECRET'?process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY:key==='API_ORIGIN'?origin:undefined}},ProductsImportService,ProductConfigurationService]})class OrderingModule{}
  app=await NestFactory.create(OrderingModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidUnknownValues:true}));app.useGlobalInterceptors(new ApiResponseInterceptor());
  for(let n=0;n<30;n++){const port=randomInt(20000,60000),reservation=createServer();try{await new Promise<void>((r,j)=>{reservation.once('error',j);reservation.listen(port,'127.0.0.1',r)});await new Promise<void>(r=>reservation.close(()=>r()));await app.listen(port,'127.0.0.1');break;}catch(e){if(n===29)throw e;}}
  origin='http://127.0.0.1:'+app.getHttpServer().address().port;owner=await app.get(JwtService).signAsync({sub:'ordering-owner',cv:credentialVersion(hash)});
  await save('ordering-ordinary',undefined,'منتج عادي');ordinary.productSlug=(await prisma.product.findUniqueOrThrow({where:{id:'ordering-ordinary'}})).slug;await save(f.drink.productId,f.drink,'مشروب مستقل');await save(f.pizza.productId,f.pizza,'بيتزا V2');await save(f.combo.productId,f.combo,'عرض Combo V2');
 },30000);
 afterAll(async()=>{await app?.close();await prisma.$disconnect();if(oldFlag===undefined)delete process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT;else process.env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=oldFlag;if(oldKey===undefined)delete process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY;else process.env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY=oldKey;});
 it('creates V2 and dependency edges via OWNER Unified Editor, keeping ordinary product unchanged',async()=>{expect(await prisma.productConfigurationDependency.count({where:{productId:'ordering-combo'}})).toBe(2);expect((await prisma.product.findUniqueOrThrow({where:{id:'ordering-ordinary'}})).configurationTree).toBeNull();});
 it('returns 410 for standalone configuration writes without changing product/configuration versions',async()=>{const before=(await http('/dashboard/products/ordering-pizza/editor',undefined,'GET',true)).body;const r=await http('/dashboard/products/ordering-pizza/configuration',{expectedVersion:before.configurationVersion,configuration:{...before.configuration,revision:before.configurationVersion+1}},'PUT',true);expect(r.status).toBe(410);expect(r.body.error).toBe('UNIFIED_PRODUCT_EDITOR_REQUIRED');expect((await http('/dashboard/products/ordering-pizza/editor',undefined,'GET',true)).body).toEqual(before);});
 it('persists an unpriced V2 draft but prevents the existing availability toggle from publishing it',async()=>{const c={schemaVersion:2,productId:'ordering-unpriced',revision:1,basePrice:null,groups:[]};const r=await http('/dashboard/products/ordering-unpriced/editor',{create:true,expectedProductVersion:0,expectedConfigurationVersion:0,product:{name:'DEMO unpriced',categoryId:'ordering-category',description:'Incomplete synthetic fixture',basePrice:null,isNew:false,isPopular:false,isFeatured:false,moodKeys:[],images:[],ingredients:[],mealDetails:[]},configuration:c},'PUT',true);expect(r.status,JSON.stringify(r.body)).toBe(200);const toggle=await http('/dashboard/products/ordering-unpriced/toggle-availability',{},'PATCH',true);expect(toggle.status).toBe(409);expect((await prisma.product.findUniqueOrThrow({where:{id:'ordering-unpriced'}})).isAvailable).toBe(false);});
 it('serves real public menu and no-store schema2 configuration with actual source/currency',async()=>{const m=await http('/public/menus/ordering-restaurant');expect(m.status).toBe(200);expect(m.body.networkWhatsappCheckoutEnabled).toBe(true);const r=await http('/public/menus/ordering-restaurant/products/ordering-combo/configuration');expect(r.status).toBe(200);expect(r.body).toMatchObject({schemaVersion:2,currency:'SYP',orderable:true});expect(r.body.linkedProducts).toHaveLength(2);expect(JSON.stringify(r.body)).not.toContain('INTEGRATION_PENDING');});
 it.each([['pizza-small','12750'],['pizza-medium','17250'],['pizza-large','21750']])('prices size %s with shared bake, per-unit garlic and highest-priced free pick',async(size,total)=>{const r=await quote(pizzaSelection(size));expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.trustedTotal).toBe(total);expect(r.body.snapshot.snapshotVersion).toBe(2);expect(r.body.snapshot.total).toBe(total);expect(r.body.priceBreakdown.filter((x:any)=>x.nodeId==='mushroom')[0].chargedAmount).toBe('0');});
 it('charges repeated CUSTOM private children independently and shared children once',async()=>{const r=await quote(comboSelection(),'ordering-combo');expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.trustedTotal).toBe('2550');expect(r.body.priceBreakdown.filter((x:any)=>x.nodeId==='gift')).toHaveLength(2);expect(r.body.linkedSourceRevisions).toEqual([{sourceProductId:'ordering-ordinary',mode:'LEGACY',configurationRevision:0}]);});
 it('uses parent-local ORIGINAL prices instead of source standalone prices',async()=>{const s=comboSelection();(s.groups[0] as any).instances=[{instanceId:'original-1',optionId:'original-drink',linkedSelection:{schemaVersion:2,productId:'ordering-drink',configurationRevision:1,groups:[{type:'SIZE',groupId:'drink-size',sizeChoiceId:'drink-small'}]}}];(s.groups[0] as any).children=[];const r=await quote(s,'ordering-combo');expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.trustedTotal).toBe('4500');});
 it.each(['price','currency','tenantId','snapshot','trustedTotal'])('rejects client-owned %s in HTTP payload',async(field)=>{const s:any=pizzaSelection();s[field]='1';expect((await quote(s)).status).toBe(400);expect((await quote(pizzaSelection(),'ordering-pizza',{[field]:'1'})).status).toBe(400);});
 it.each(['wrong-group','wrong-size','minimum','maximum','unavailable','private-child','duplicate-instance','revision','v1'])('rejects invalid selection: %s',async(kind)=>{const s:any=pizzaSelection();if(kind==='wrong-group')s.groups[0].groupId='foreign-size';if(kind==='wrong-size')s.groups[0].sizeChoiceId='not-a-size';if(kind==='minimum')s.groups[1].instances=[];if(kind==='maximum')s.groups[1].instances=[1,2,3,4].map(n=>({instanceId:'m'+n,optionId:'mushroom'}));if(kind==='unavailable')s.groups[1].instances=[{instanceId:'x',optionId:'unavailable-extra'}];if(kind==='private-child')s.groups[1].instances[0].children=[];if(kind==='duplicate-instance')s.groups[1].instances[1].instanceId='cheese-1';if(kind==='revision')s.configurationRevision=0;if(kind==='v1')s.schemaVersion=1;const r=await quote(s);expect([400,409]).toContain(r.status);expect(r.body.trustedTotal).toBeUndefined();});
 it('rejects cross-tenant product/linked selections and unauthorized editor writes',async()=>{const s:any=comboSelection();s.groups[0].instances[0].linkedSelection.productId='ordering-other-product';expect((await quote(s,'ordering-combo')).status).toBe(400);expect((await http('/public/menus/ordering-other/products/ordering-pizza/configuration')).status).toBe(404);const r=await fetch(origin+'/dashboard/products/ordering-pizza/editor');expect(r.status).toBe(401);const a=await fetch(origin+'/dashboard/products/ordering-pizza/editor',{headers:{...headers(),'x-restaurant-id':'ordering-other'}});expect([403,404]).toContain(a.status);});
 it('rejects circular references through the authorized editor and keeps the original tree',async()=>{const before=(await http('/dashboard/products/ordering-drink/editor',undefined,'GET',true)).body;const config=clone(before.configuration);config.revision=2;config.groups=[{type:'OPTIONS',id:'cycle',label:'Cycle',min:0,max:1,includedQuantity:0,options:[{id:'cycle-option',label:'Cycle',price:'0',maxQuantity:1,linkedProduct:{sourceProductId:'ordering-combo',mode:'ORIGINAL'}}]}];const r=await http('/dashboard/products/ordering-drink/editor',{create:false,expectedProductVersion:before.editVersion,expectedConfigurationVersion:before.configurationVersion,product:before.product,configuration:config},'PUT',true);expect([400,409]).toContain(r.status);expect((await http('/dashboard/products/ordering-drink/editor',undefined,'GET',true)).body).toEqual(before);});
 it('prepares a trusted mixed message with size, children, quantities and no order write',async()=>{const n=await prisma.order.count();const r=await prepare(request([line(),ordinary]));expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.draft).toMatchObject({itemsSubtotal:'13150',deliveryFee:null,totalAmount:'13150',requiresExplicitAcceptance:true});for(const text of ['بيتزا V2','صغير','ثوم','فطر','منتج عادي','تحمير إضافي'])expect(r.body.messagePreview).toContain(text);expect(await prisma.order.count()).toBe(n);});
 it('preserves existing delivery fees and pickup behavior',async()=>{const r=await prepare(request([line()],{fulfillmentType:'delivery',deliveryArea:'Synthetic area',deliveryNear:'Synthetic street',deliveryBeside:'Synthetic landmark'}));expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.draft).toMatchObject({itemsSubtotal:'12750',deliveryFee:'1500',totalAmount:'14250'});expect((await prepare(request())).body.draft.deliveryFee).toBeNull();});
 it('prepares and confirms the reported 79100 plus 1500 SYP synthetic delivery, retrying without duplicate orders',async()=>{
  const req=request([{...line(),quantity:6},{...ordinary,quantity:13}],{fulfillmentType:"delivery",deliveryArea:"حلب",deliveryNear:"معلم اصطناعي"});
  const prepared=await prepare(req);expect(prepared.status).toBe(200);
  expect(prepared.body.draft).toMatchObject({itemsSubtotal:"79100",deliveryFee:"1500",totalAmount:"80600"});
  const count=await prisma.order.count(),key=randomUUID();
  const result=await confirm(req,prepared.body.acceptanceToken,key);expect(result.status,JSON.stringify(result.body)).toBe(200);
  expect(result.body.whatsappUrl).toMatch(/^https:\/\/wa.me\//);expect(result.body.message).toContain("80600");
  const retry=await confirm(req,prepared.body.acceptanceToken,key);expect(retry.body.orderId).toBe(result.body.orderId);expect(await prisma.order.count()).toBe(count+1);
 });
 it('keeps ordinary-only carts on the existing WhatsApp endpoint',async()=>{const r=await prepare(request([ordinary]));expect(r.status).toBe(400);expect(r.body.error).toBe('LEGACY_CHECKOUT_REQUIRED');});
 it('refuses forged snapshot and client total during checkout',async()=>{expect((await prepare(request([{...line(),snapshot:{total:'1'}}]))).status).toBe(400);expect((await prepare({...request(),totalAmount:'1'})).status).toBe(400);});
 it('keeps lineErrors for invalid selections without silently re-forming them',async()=>{const beforeCount=await prisma.order.count();const s:any=pizzaSelection();s.groups[1].instances=[];const r=await prepare(request([line(s)]));expect(r.status).toBe(400);expect(r.body.lineErrors[0].lineId).toBe('pizza-line');expect(await prisma.order.count()).toBe(beforeCount);});
 it('refuses an unavailable owner and disabled capability without touching any order',async()=>{await http('/dashboard/products/ordering-pizza/toggle-availability',{},'PATCH',true);try{expect((await quote(pizzaSelection())).status).toBe(409);}finally{await http('/dashboard/products/ordering-pizza/toggle-availability',{},'PATCH',true);}await prisma.subscriptionFeature.updateMany({where:{planId:'ordering-plan',key:'PRODUCT_CONFIGURATION'},data:{enabled:false}});try{expect((await quote(pizzaSelection())).status).toBe(403);expect((await http('/public/menus/ordering-restaurant/products/ordering-pizza/configuration')).status).toBe(404);}finally{await prisma.subscriptionFeature.updateMany({where:{planId:'ordering-plan',key:'PRODUCT_CONFIGURATION'},data:{enabled:true}});}});
 it('rejects changed linked revision and unavailable linked source',async()=>{const s:any=comboSelection();s.groups[0].children=[];s.groups[0].instances=[{instanceId:'original-one',optionId:'original-drink',linkedSelection:{schemaVersion:2,productId:'ordering-drink',configurationRevision:999,groups:[{type:'SIZE',groupId:'drink-size',sizeChoiceId:'drink-small'}]}}];expect((await quote(s,'ordering-combo')).status).toBe(409);s.groups[0].instances[0].linkedSelection.configurationRevision=1;await http('/dashboard/products/ordering-drink/toggle-availability',{},'PATCH',true);try{expect([400,409]).toContain((await quote(s,'ordering-combo')).status);}finally{await http('/dashboard/products/ordering-drink/toggle-availability',{},'PATCH',true);}});
 it('rejects cross-restaurant ORIGINAL/CUSTOM references on the real editor and keeps the saved graph',async()=>{await prisma.product.create({data:{id:'foreign-source',restaurantId:'ordering-other',slug:'foreign',name:'Synthetic foreign',basePrice:'10',currency:'USD'}});const current=(await http('/dashboard/products/ordering-combo/editor',undefined,'GET',true)).body;for(const mode of ['ORIGINAL','CUSTOM']){const c=clone(current.configuration);c.revision=2;const o=c.groups[0].options.find((o:any)=>o.id===(mode==='ORIGINAL'?'original-drink':'custom-component'));o.linkedProduct.sourceProductId='foreign-source';if(mode==='CUSTOM')o.linkedProduct.customConfiguration.productId='foreign-source';const r=await http('/dashboard/products/ordering-combo/editor',{create:false,expectedProductVersion:current.editVersion,expectedConfigurationVersion:current.configurationVersion,product:current.product,configuration:c},'PUT',true);expect([400,409]).toContain(r.status);}expect((await http('/dashboard/products/ordering-combo/editor',undefined,'GET',true)).body).toEqual(current);});
 it('rejects fractional SYP option prices via authorized save without changing the tree',async()=>{const current=(await http('/dashboard/products/ordering-pizza/editor',undefined,'GET',true)).body;const c=clone(current.configuration);c.revision=2;c.groups[1].options[1].price='1.5';const r=await http('/dashboard/products/ordering-pizza/editor',{create:false,expectedProductVersion:current.editVersion,expectedConfigurationVersion:current.configurationVersion,product:current.product,configuration:c},'PUT',true);expect(r.status).toBe(400);expect((await http('/dashboard/products/ordering-pizza/editor',undefined,'GET',true)).body).toEqual(current);});
 it('rejects a modified acceptance token, changed selection and cross-restaurant token reuse',async()=>{const req=request(),p=await prepare(req),n=await prisma.order.count();expect(p.status).toBe(200);const token=p.body.acceptanceToken;expect((await confirm(req,token.slice(0,-5)+'AAAAA')).status).toBe(409);const changed=pizzaSelection('pizza-large');expect((await confirm(request([line(changed)]),token)).status).toBe(409);expect((await http('/public/menus/ordering-other/checkout/whatsapp/confirm',{request:req,acceptanceToken:token,idempotencyKey:randomUUID()})).status).not.toBe(200);expect(await prisma.order.count()).toBe(n);});
 it('serializes concurrent confirms of one accepted request into one synthetic order',async()=>{const req=request(),p=await prepare(req),n=await prisma.order.count(),key=randomUUID();expect(p.status).toBe(200);const results=await Promise.all([confirm(req,p.body.acceptanceToken,key),confirm(req,p.body.acceptanceToken,key)]);expect(results.map(r=>r.status)).toEqual([200,200]);expect(results[0].body.orderId).toBe(results[1].body.orderId);expect(await prisma.order.count()).toBe(n+1);expect((await confirm(request([{...line(),quantity:2}]),p.body.acceptanceToken,key)).status).toBe(409);});
 it.each(['sequential','concurrent'])('does not reuse one acceptance token with new keys: %s',async mode=>{const req=request(),p=await prepare(req),n=await prisma.order.count();expect(p.status).toBe(200);const key1=randomUUID(),key2=randomUUID();const results=mode==='concurrent'?await Promise.all([confirm(req,p.body.acceptanceToken,key1),confirm(req,p.body.acceptanceToken,key2)]):[await confirm(req,p.body.acceptanceToken,key1),await confirm(req,p.body.acceptanceToken,key2)];expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(await prisma.order.count()).toBe(n+1);});
 it('issues distinct approvals for identical prepares even in the same clock millisecond',async()=>{const frozen=vi.spyOn(Date,'now').mockReturnValue(Date.now()+1000);try{const one=await prepare(request()),two=await prepare(request());expect(one.status).toBe(200);expect(two.status).toBe(200);expect(one.body.acceptanceToken).not.toBe(two.body.acceptanceToken);}finally{frozen.mockRestore();}});
 it('rejects old price/config acceptance and explicitly reaccepts the revised HTTP quote',async()=>{const req=request();const old=await prepare(req);expect(old.status).toBe(200);await updateTree('ordering-pizza',c=>{(c.groups[0] as any).sizes[0].price='11500';});expect((await confirm(req,old.body.acceptanceToken)).status).toBe(409);const next=pizzaSelection();next.configurationRevision=2;const q=await quote(next);expect(q.body.trustedTotal).toBe('13250');const current=request([{...line(next),expectedUnitPrice:'13250'}]);const p=await prepare(current);expect(p.status,JSON.stringify(p.body)).toBe(200);expect((await confirm(current,old.body.acceptanceToken)).status).toBe(409);const id=randomUUID(),confirmed=await confirm(current,p.body.acceptanceToken,id);expect(confirmed.status,JSON.stringify(confirmed.body)).toBe(200);expect(confirmed.body.orderNumber).toMatch(/\d+/);expect(confirmed.body.message).toContain(confirmed.body.orderNumber);const replay=await confirm(current,p.body.acceptanceToken,id);expect(replay.body.orderId).toBe(confirmed.body.orderId);expect(replay.body.replayed).toBe(true);const stored=await prisma.orderItem.findFirstOrThrow({where:{orderId:confirmed.body.orderId}});expect((stored.options as any).configurationSnapshot.snapshotVersion).toBe(2);expect((stored.options as any).configurationSnapshot.selection.configurationRevision).toBe(2);await updateTree('ordering-pizza',c=>{(c.groups[0] as any).sizes[0].price='11000';});});
 it('rejects restaurant/product currency mismatch from trusted catalog data',async()=>{await prisma.product.update({where:{id:'ordering-pizza'},data:{currency:'USD'}});try{const s=pizzaSelection();s.configurationRevision=3;expect((await quote(s)).status).toBe(409);}finally{await prisma.product.update({where:{id:'ordering-pizza'},data:{currency:'SYP'}});}});
 it('preserves the ordinary WhatsApp HTTP order, amount and idempotency on its original endpoint',async()=>{const body={fulfillmentType:'pickup',items:[{productSlug:ordinary.productSlug,productId:ordinary.productId,expectedUnitPrice:"200",quantity:2}],idempotencyKey:randomUUID()};const r=await http('/public/menus/ordering-restaurant/orders/whatsapp',body);expect(r.status,JSON.stringify(r.body)).toBe(201);const stored=await prisma.order.findUniqueOrThrow({where:{id:r.body.orderId}});expect(stored.totalAmount.toString()).toBe('400');expect(r.body.message).toContain('منتج عادي');expect((await http('/public/menus/ordering-restaurant/orders/whatsapp',body)).body.orderId).toBe(r.body.orderId);});
  it.each([undefined,"deleted-old-id","ordering-pizza","ordering-other-product"])("rejects ordinary identity %s even when the slug exists",async productId=>{
    const before=await prisma.order.count();const invalid={...ordinary,productId};
    expect([400,409]).toContain((await prepare(request([invalid,await currentLine()]))).status);
    const good=await prepare(request([ordinary,await currentLine()]));expect(good.status).toBe(200);
    expect([400,409]).toContain((await confirm(request([invalid,await currentLine()]),good.body.acceptanceToken)).status);
    const old=await http('/public/menus/ordering-restaurant/orders/whatsapp',{items:[{productSlug:ordinary.productSlug,productId,expectedUnitPrice:"200",quantity:1}]});
    expect([400,409]).toContain(old.status);expect(await prisma.order.count()).toBe(before);
  });
  it("rejects a replacement product using a deleted ordinary slug and preserves valid mixed lines",async()=>{
    const original=await prisma.product.findUniqueOrThrow({where:{id:ordinary.productId}});
    await prisma.product.update({where:{id:original.id},data:{slug:"retired-ordinary",deletedAt:new Date()}});
    await prisma.product.create({data:{id:"replacement-ordinary",restaurantId:original.restaurantId,name:"Replacement",slug:ordinary.productSlug,basePrice:200,currency:"SYP",isActive:true,isAvailable:true}});
    try {const before=await prisma.order.count();const p=await prepare(request([ordinary,await currentLine()]));expect(p.status).toBe(409);expect(await prisma.order.count()).toBe(before);}
    finally {await prisma.product.delete({where:{id:"replacement-ordinary"}});await prisma.product.update({where:{id:original.id},data:{slug:original.slug,deletedAt:null}});}
  });
  it("requires explicit acceptance of the current ordinary price on both checkout routes",async()=>{
    const initial=request([ordinary,await currentLine()]), accepted=await prepare(initial);
    expect(accepted.status).toBe(200);
    const before=await prisma.order.count();
    await prisma.product.update({where:{id:ordinary.productId},data:{basePrice:250}});
    try {
      expect((await confirm(initial,accepted.body.acceptanceToken)).status).toBe(409);
      const refreshed=await prepare(initial);expect(refreshed.status).toBe(200);expect(refreshed.body.draft.items.find((x:any)=>x.lineId===ordinary.lineId)).toMatchObject({unitPrice:"250",changed:true});
      const body={items:[{productId:ordinary.productId,productSlug:ordinary.productSlug,quantity:1,expectedUnitPrice:"200"}],fulfillmentType:"pickup"};
      expect((await http('/public/menus/ordering-restaurant/orders/whatsapp',body)).status).toBe(409);
      expect(await prisma.order.count()).toBe(before);
      const revised=request([{...ordinary,expectedUnitPrice:"250"},await currentLine()]);
      const next=await prepare(revised);expect(next.status).toBe(200);
      expect((await confirm(revised,accepted.body.acceptanceToken)).status).toBe(409);
      expect((await confirm(revised,next.body.acceptanceToken)).status).toBe(200);
      expect((await http('/public/menus/ordering-restaurant/orders/whatsapp',{...body,items:[{...body.items[0],expectedUnitPrice:"250"}]})).status).toBe(201);
    } finally {await prisma.product.update({where:{id:ordinary.productId},data:{basePrice:200}});}
  });
  it("rejects ordinary availability changes between Prepare and Confirm",async()=>{
    const req=request([ordinary,await currentLine()]), approval=await prepare(req);expect(approval.status).toBe(200);
    const before=await prisma.order.count();await prisma.product.update({where:{id:ordinary.productId},data:{isAvailable:false}});
    try {
      expect((await prepare(req)).status).toBe(409);
      expect((await confirm(req,approval.body.acceptanceToken)).status).toBe(409);
      const r=await http('/public/menus/ordering-restaurant/orders/whatsapp',{items:[{productId:ordinary.productId,productSlug:ordinary.productSlug,expectedUnitPrice:"200",quantity:1}]});
      expect([400,409]).toContain(r.status);expect(await prisma.order.count()).toBe(before);
    } finally {await prisma.product.update({where:{id:ordinary.productId},data:{isAvailable:true}});}
  });
  async function currentLine(){return (await currentRequest()).items[0];}
  // Task6 replaces financially relevant historical Stage6 test-only cases with the live public writer.
  async function currentRequest(extra: Record<string, unknown> = {}) {
    const row = await prisma.product.findUniqueOrThrow({where:{id:'ordering-pizza'}});
    const selected = pizzaSelection();selected.configurationRevision=row.configurationVersion;
    return request([line(selected)],extra);
  }
  async function actor(id: string, role: 'USER'|'SUPER_ADMIN' = 'USER', restaurantId = 'ordering-restaurant') {
    const hash=randomBytes(32).toString('hex');
    await prisma.user.create({data:{id,email:id+'@ordering.invalid',role,passwordHash:hash}});
    if(role==='USER')await prisma.restaurantMember.create({data:{userId:id,restaurantId,role:'OWNER'}});
    return app.get(JwtService).signAsync({sub:id,cv:credentialVersion(hash)});
  }
  it('rechecks current membership, server role and credential version on real authenticated HTTP',async()=>{
    const token=await actor('closure-member');
    const get=(tenant:string,bearer=token)=>fetch(origin+'/dashboard/products',{headers:{authorization:'Bearer '+bearer,'x-restaurant-id':tenant}});
    expect((await get('ordering-restaurant')).status).toBe(200);expect((await get('ordering-other')).status).toBe(403);
    await prisma.restaurantMember.deleteMany({where:{userId:'closure-member'}});expect((await get('ordering-restaurant')).status).toBe(403);
    await prisma.user.update({where:{id:'closure-member'},data:{role:'SUPER_ADMIN'}});expect((await get('ordering-other')).status).toBe(200);
    const replacement=randomBytes(32).toString('hex');await prisma.user.update({where:{id:'closure-member'},data:{passwordHash:replacement}});
    expect((await get('ordering-other')).status).toBe(401);
    const renewed=await app.get(JwtService).signAsync({sub:'closure-member',cv:credentialVersion(replacement)});expect((await get('ordering-other',renewed)).status).toBe(200);
    await prisma.user.delete({where:{id:'closure-member'}});expect((await get('ordering-other',renewed)).status).toBe(401);
  });
  it('authenticates against the real password hash, prevents caching and revokes old sessions after rotation',async()=>{
    const password=randomBytes(24).toString('hex'),replacement=randomBytes(24).toString('hex'),email='closure-login@ordering.invalid';
    await prisma.user.create({data:{id:'closure-login',email,passwordHash:await bcrypt.hash(password,10)}});
    await prisma.restaurantMember.create({data:{userId:'closure-login',restaurantId:'ordering-restaurant',role:'OWNER'}});
    const login=(value:string,address=email)=>fetch(origin+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:address,password:value})});
    const response=await login(password);expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('no-store');const before=(await response.json()).data;expect(before.user).not.toHaveProperty('passwordHash');
    await prisma.user.update({where:{id:'closure-login'},data:{passwordHash:await bcrypt.hash(replacement,10)}});
    expect((await fetch(origin+'/dashboard/products',{headers:{authorization:'Bearer '+before.accessToken,'x-restaurant-id':'ordering-restaurant'}})).status).toBe(401);
    const wrong=await login(password),unknown=await login(password,'missing@ordering.invalid');expect(wrong.status).toBe(401);expect(unknown.status).toBe(401);expect((await wrong.json()).message).toEqual((await unknown.json()).message);expect((await login(replacement)).status).toBe(201);
  });
  it('retains the last branch during concurrent deletes on the same synthetic restaurant',async()=>{
    const r=await prisma.restaurant.create({data:{slug:'closure-branches',name:'Synthetic branches'}});
    const rows=await Promise.all(['one','two'].map(slug=>prisma.branch.create({data:{restaurantId:r.id,slug,name:slug}})));
    const results=await Promise.allSettled(rows.map(row=>app.get(DashboardService).deleteBranch(r.id,row.id)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await prisma.branch.count({where:{restaurantId:r.id,deletedAt:null}})).toBe(1);
  });
  it('validates SVG upload content, MIME, role and tenant provenance over HTTP',async()=>{
    const employee=await actor('closure-employee');await prisma.restaurantMember.updateMany({where:{userId:'closure-employee'},data:{role:'EMPLOYEE'}});
    const send=(content:string,token=owner,mime='image/svg+xml')=>{const form=new FormData();form.append('type','SVG_ICON');form.append('file',new Blob([content],{type:mime}),'plate.svg');return fetch(origin+'/dashboard/media/upload',{method:'POST',headers:{authorization:'Bearer '+token,'x-restaurant-id':'ordering-restaurant'},body:form});};
    const safe='<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>';
    expect((await send(safe,employee)).status).toBe(403);expect((await send(safe,owner,'image/png')).status).toBe(400);expect((await send('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).status).toBe(400);
    const response=await send(safe);expect(response.status).toBe(201);const data=(await response.json()).data;
    expect(await prisma.mediaAsset.findUniqueOrThrow({where:{id:data.id}})).toMatchObject({restaurantId:'ordering-restaurant',type:'SVG_ICON',validatedFormat:'SVG'});
  });
  it('allows only tenant-owned validated models to be attached, preserving the existing media boundary',async()=>{
    await prisma.product.create({data:{id:'closure-media-product',restaurantId:'ordering-restaurant',slug:'closure-media',name:'Synthetic media product',basePrice:'100',currency:'SYP',isAvailable:false}});
    const url='https://res.cloudinary.com/unit/raw/upload/fixture.glb';const attach=()=>http('/dashboard/media/products/closure-media-product/3d',{url,expectedProductVersion:0},'POST',true);
    const asset=await prisma.mediaAsset.create({data:{restaurantId:'ordering-other',url,type:'MODEL_3D',provider:'CLOUDINARY',validatedFormat:'GLB'}});
    expect((await attach()).status).toBe(400);await prisma.mediaAsset.update({where:{id:asset.id},data:{restaurantId:'ordering-restaurant',validatedFormat:null}});expect((await attach()).status).toBe(400);
    await prisma.mediaAsset.update({where:{id:asset.id},data:{validatedFormat:'GLB'}});expect((await attach()).status).toBe(201);
  });
  it('imports an ordinary Arabic product and edits it through Unified Save without converting it into Network',async()=>{
    const admin=await actor('closure-import-admin','SUPER_ADMIN');const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Products');sheet.addRow([...PRODUCT_IMPORT_COLUMNS]);sheet.addRow(['','وجبة استيراد آمنة','DEMO V2','12500','وصف الاختبار',false,false,'','','']);
    const buffer=await workbook.xlsx.writeBuffer(),form=new FormData();form.append('file',new Blob([new Uint8Array(buffer)]),'ordinary.xlsx');
    const response=await fetch(origin+'/dashboard/products/import',{method:'POST',headers:{authorization:'Bearer '+admin,'x-restaurant-id':'ordering-restaurant'},body:form});const raw=await response.json();expect(response.status,JSON.stringify(raw)).toBe(201);expect(raw.data.importedCount).toBe(1);
    const row=await prisma.product.findFirstOrThrow({where:{restaurantId:'ordering-restaurant',name:'وجبة استيراد آمنة'}});expect(row.configurationVersion).toBe(0);expect(row.configurationTree).toBeNull();expect(row.basePrice?.toString()).toBe('12500');
    const saved=(await http('/dashboard/products/'+row.id+'/editor',undefined,'GET',true)).body;const input={create:false,expectedProductVersion:saved.editVersion,expectedConfigurationVersion:0,product:{...saved.product,description:'Edited after import'}};
    expect((await http('/dashboard/products/'+row.id+'/editor',input,'PUT',true)).status).toBe(200);expect((await prisma.product.findUniqueOrThrow({where:{id:row.id}})).configurationVersion).toBe(0);
  });
  it('protects V2 linked sources and their category from soft and hard deletion',async()=>{
    expect((await http('/dashboard/products/ordering-drink',undefined,'DELETE',true)).status).toBe(409);await expect(prisma.product.delete({where:{id:'ordering-drink'}})).rejects.toThrow();
    const category=await prisma.category.create({data:{restaurantId:'ordering-restaurant',slug:'closure-linked',name:'Linked source'}});
    await prisma.product.update({where:{id:'ordering-drink'},data:{categoryId:category.id}});
    try {await expect(app.get(DashboardService).deleteCategory('ordering-restaurant',category.id)).rejects.toMatchObject({status:409});expect((await prisma.category.findUniqueOrThrow({where:{id:category.id}})).deletedAt).toBeNull();}
    finally {await prisma.product.update({where:{id:'ordering-drink'},data:{categoryId:'ordering-category'}});}
  });
  it('requires the exact accepted token for same-key replay and retains old committed-response recovery',async()=>{
    const req=await currentRequest(),prepared=await prepare(req),key=randomUUID();expect(prepared.status).toBe(200);const first=await confirm(req,prepared.body.acceptanceToken,key);expect(first.status).toBe(200);
    expect((await confirm(req,prepared.body.acceptanceToken+'x',key)).status).toBe(409);expect((await confirm(req,prepared.body.acceptanceToken,key)).body.orderId).toBe(first.body.orderId);
  });
  it.each(['item','analytics'])('rolls back the whole real order when its %s insert fails',async fault=>{
    const req=await currentRequest({orderNote:'synthetic fault '+fault}),prepared=await prepare(req),before=await prisma.order.count(),beforeItems=await prisma.orderItem.count(),beforeEvents=await prisma.analyticsEvent.count();expect(prepared.status).toBe(200);
    const table=fault==='item'?'OrderItem':'AnalyticsEvent';
    await prisma.$executeRawUnsafe(`CREATE FUNCTION closure_reject_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private storage error'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER closure_reject_write BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION closure_reject_write()`);
    try {const result=await confirm(req,prepared.body.acceptanceToken);expect(result.status).toBe(503);expect(JSON.stringify(result.body)).not.toMatch(/Prisma|storage error|stack|23514/);expect(await prisma.order.count()).toBe(before);expect(await prisma.orderItem.count()).toBe(beforeItems);expect(await prisma.analyticsEvent.count()).toBe(beforeEvents);}
    finally {await prisma.$executeRawUnsafe(`DROP TRIGGER closure_reject_write ON "${table}"`);await prisma.$executeRawUnsafe('DROP FUNCTION closure_reject_write()');}
    expect((await confirm(req,prepared.body.acceptanceToken)).status).toBe(200);
  });
  it.each(['P2034','40001','40P01'])('returns safe Prepare conflict %s after rolling back its real PostgreSQL transaction',async code=>{
    const req=await currentRequest(),before=await prisma.order.count(),real=prisma.$transaction.bind(prisma);let attempts=0;
    const spy=vi.spyOn(prisma,'$transaction').mockImplementation(((work:any,options:any)=>real(async tx=>{await tx.$executeRaw`INSERT INTO "AnalyticsEvent" ("id","restaurantId","type","createdAt") VALUES ('closure-rolled-back','ordering-restaurant','SYNTHETIC',NOW())`;attempts++;if(code==='P2034')throw new Prisma.PrismaClientKnownRequestError('private storage failure',{code:'P2034',clientVersion:'5.22.0'});await tx.$executeRawUnsafe(`DO $$ BEGIN RAISE EXCEPTION 'private storage failure' USING ERRCODE='${code}'; END $$`);return work(tx);},options)) as any);
    try {const r=await prepare(req);expect(r.status).toBe(409);expect(r.body.error).toBe('WHATSAPP_CHECKOUT_CONCURRENT_UPDATE');expect(JSON.stringify(r.body)).not.toMatch(/Prisma|storage failure|stack|P2034|P2010/);expect(attempts).toBe(1);expect(await prisma.analyticsEvent.count({where:{id:'closure-rolled-back'}})).toBe(0);expect(await prisma.order.count()).toBe(before);}
    finally {spy.mockRestore();}
  });
  it.each(['lost-response','unconfirmed-read'])('recovers committed order after %s without duplicating it',async fault=>{
    const req=await currentRequest({orderNote:'response recovery '+fault}),prepared=await prepare(req),before=await prisma.order.count(),key=randomUUID(),real=prisma.$transaction.bind(prisma),read=prisma.order.findUnique.bind(prisma.order);let committed=false;
    const txSpy=vi.spyOn(prisma,'$transaction').mockImplementation((async(work:any,options:any)=>{await real(work,options);committed=true;throw new Error('synthetic lost response');}) as any);
    const readSpy=fault==='unconfirmed-read'?vi.spyOn(prisma.order,'findUnique').mockImplementation(((...args:any[])=>{if(committed)throw new Error('synthetic read outage');return (read as any)(...args);}) as any):null;
    let first:any;try {first=await confirm(req,prepared.body.acceptanceToken,key);expect(first.status).toBe(fault==='lost-response'?200:500);expect(JSON.stringify(first.body)).not.toMatch(/synthetic|Prisma|stack/);}
    finally {txSpy.mockRestore();readSpy?.mockRestore();}
    expect(await prisma.order.count()).toBe(before+1);const retry=await confirm(req,prepared.body.acceptanceToken,key);expect(retry.status).toBe(200);expect(retry.body.replayed).toBe(true);expect(await prisma.order.count()).toBe(before+1);
  });
  async function productRace(kind:'price'|'availability'|'source'|'capability') {
    const before=await prisma.order.count();let req:any=await currentRequest();
    if(kind==='source'){const c=comboSelection(),sourceRow=await prisma.product.findUniqueOrThrow({where:{id:'ordering-drink'}});(c.groups[0] as any).instances=[{instanceId:'race-original',optionId:'original-drink',linkedSelection:{schemaVersion:2,productId:'ordering-drink',configurationRevision:sourceRow.configurationVersion,groups:[{type:'SIZE',groupId:'drink-size',sizeChoiceId:'drink-small'}]}}];(c.groups[0] as any).children=[];req=request([{mode:'NETWORK',lineId:'race-source',productId:'ordering-combo',quantity:1,selection:c,expectedUnitPrice:'4500'}]);}
    const prepared=await prepare(req);expect(prepared.status).toBe(200);const id=kind==='source'?'ordering-drink':'ordering-pizza',old=await prisma.product.findUniqueOrThrow({where:{id}}),tree=clone(old.configurationTree) as unknown as ProductConfigurationV2;
    let release!:()=>void,ready!:()=>void;const wait=new Promise<void>(r=>release=r),locked=new Promise<void>(r=>ready=r);const other=new PrismaClient({datasourceUrl:url});
    const writer=other.$transaction(async tx=>{if(kind==='capability')await tx.subscriptionFeature.updateMany({where:{planId:'ordering-plan',key:'PRODUCT_CONFIGURATION'},data:{enabled:false}});else if(kind==='availability')await tx.product.update({where:{id},data:{isAvailable:false}});else{tree.revision++;(tree.groups[0] as any).sizes[0].price=kind==='source'?'9500':'11500';await tx.product.update({where:{id},data:{configurationTree:tree as any,configurationVersion:tree.revision,editVersion:{increment:1}}});}ready();await wait;},{timeout:15000});
    await locked;let response:any;
    try {const pending=confirm(req,prepared.body.acceptanceToken);let observed=false;const deadline=Date.now()+7000;
      while(Date.now()<deadline){const rows=await other.$queryRawUnsafe<Array<{n:bigint}>>(`SELECT count(*) n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%${kind==='capability'?'SubscriptionFeature':'Product'}%FOR SHARE%'`);if(Number(rows[0].n)>0){observed=true;break;}await new Promise(r=>setTimeout(r,20));}
      expect(observed,'Real PostgreSQL product lock wait was observed').toBe(true);release();await writer;response=await pending;expect(response.status).toBe(kind==='capability'?403:409);expect(await prisma.order.count()).toBe(before);
    } finally {release();await writer;await other.$disconnect();if(kind==='capability')await prisma.subscriptionFeature.updateMany({where:{planId:'ordering-plan',key:'PRODUCT_CONFIGURATION'},data:{enabled:true}});await prisma.product.update({where:{id},data:{isAvailable:old.isAvailable,configurationTree:old.configurationTree as any,configurationVersion:old.configurationVersion,editVersion:old.editVersion}});}
  }
  it.each(['price','availability','source','capability'] as const)('rechecks the %s writer that wins the actual PostgreSQL row lock race',async kind=>productRace(kind),20000);
  it.each([1,5,10,25])('keeps %i distinct confirmations atomic and correctly numbered',async count=>{
    const base=await currentRequest(),before=await prisma.order.count();const payloads=await Promise.all(Array.from({length:count},async(_,i)=>{const req={...base,orderNote:`distinct-${count}-${i}-${randomUUID()}`},p=await prepare(req);expect(p.status).toBe(200);return {req,token:p.body.acceptanceToken};}));
    const results=await Promise.all(payloads.map(p=>confirm(p.req,p.token)));expect(results.every(r=>r.status===200)).toBe(true);expect(new Set(results.map(r=>r.body.orderNumber)).size).toBe(count);expect(await prisma.order.count()).toBe(before+count);
    const rows=await prisma.order.findMany({where:{id:{in:results.map(r=>r.body.orderId)}},include:{items:true}});expect(rows.every(r=>r.currency==='SYP'&&r.totalAmount.toString()==='12750'&&r.items.length===1&&(r.items[0].options as any).configurationSnapshot.snapshotVersion===2&&r.acceptanceTokenHash!==null)).toBe(true);
  },30000);
  it.each([5,10,25])('prevents duplicates for %i same-key and same-token requests',async count=>{
    const req=await currentRequest({orderNote:'same-key-'+count}),p=await prepare(req),key=randomUUID(),before=await prisma.order.count();expect(p.status).toBe(200);
    const results=await Promise.all(Array.from({length:count},()=>confirm(req,p.body.acceptanceToken,key)));expect(results.every(r=>r.status===200)).toBe(true);expect(new Set(results.map(r=>r.body.orderId)).size).toBe(1);
    const reused=await Promise.all(Array.from({length:count},()=>confirm(req,p.body.acceptanceToken)));expect(reused.every(r=>r.status===409)).toBe(true);expect(await prisma.order.count()).toBe(before+1);
  },30000);
  it('rejects ten concurrent changed payloads for one idempotency key',async()=>{
    const base=await currentRequest(),key=randomUUID(),before=await prisma.order.count();const payloads=await Promise.all(Array.from({length:10},async(_,i)=>{const req={...base,orderNote:'changed-'+i},p=await prepare(req);expect(p.status).toBe(200);return {req,token:p.body.acceptanceToken};}));const results=await Promise.all(payloads.map(p=>confirm(p.req,p.token,key)));expect(results.filter(r=>r.status===200)).toHaveLength(1);expect(results.filter(r=>r.status===409)).toHaveLength(9);expect(await prisma.order.count()).toBe(before+1);
  });
  it.each([5,10,25])('isolates %i concurrent confirmations across two real tenants and currencies',async count=>{
    const otherToken=await actor('closure-other-owner-'+count,'USER','ordering-other');const config={schemaVersion:2,productId:'closure-other-product-'+count,revision:1,basePrice:'12.34',groups:[]};
    const input={create:true,expectedProductVersion:0,expectedConfigurationVersion:0,configuration:config,product:{name:'Synthetic USD',description:'',categoryId:null,basePrice:'12.34',isNew:false,isPopular:false,isFeatured:false,moodKeys:[],images:[],ingredients:[],mealDetails:[]}};
    const r=await fetch(origin+'/dashboard/products/'+config.productId+'/editor',{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+otherToken,'x-restaurant-id':'ordering-other'},body:JSON.stringify(input)});expect(r.status,await r.text()).toBe(200);
    expect((await fetch(origin+'/dashboard/products/'+config.productId+'/toggle-availability',{method:'PATCH',headers:{authorization:'Bearer '+otherToken,'x-restaurant-id':'ordering-other'}})).status).toBe(200);
    const base=await currentRequest(),before=await prisma.order.count();const payloads=await Promise.all(Array.from({length:count},async(_,i)=>{const other=i%2===1,slug=other?'ordering-other':'ordering-restaurant',req=other?request([{mode:'NETWORK',lineId:'usd-line',productId:config.productId,quantity:1,selection:{schemaVersion:2,productId:config.productId,configurationRevision:1,groups:[]},expectedUnitPrice:'12.34'}],{orderNote:'other-'+i}):{...base,orderNote:'same-'+i};const p=await prepare(req,slug);expect(p.status).toBe(200);return {slug,req,token:p.body.acceptanceToken};}));
    const results=await Promise.all(payloads.map(p=>http('/public/menus/'+p.slug+'/checkout/whatsapp/confirm',{request:p.req,acceptanceToken:p.token,idempotencyKey:randomUUID()})));expect(results.every(r=>r.status===200)).toBe(true);expect(await prisma.order.count()).toBe(before+count);
    const rows=await prisma.order.findMany({where:{id:{in:results.map(r=>r.body.orderId)}},include:{items:true}});expect(rows.filter(r=>r.restaurantId==='ordering-other').every(r=>r.currency==='USD'&&r.totalAmount.toString()==='12.34'&&r.items[0].productId===config.productId)).toBe(true);expect(rows.filter(r=>r.restaurantId==='ordering-restaurant').every(r=>r.currency==='SYP'&&r.totalAmount.toString()==='12750')).toBe(true);
  },30000);

  it.each([10,50])('persists %i independent V2 lines without deduplicating their Product IDs',async count=>{
    const base=await currentRequest(),selection=(base.items[0] as any).selection;
    const req=request(Array.from({length:count},(_,i)=>({...line(clone(selection)),lineId:'independent-'+i})),{orderNote:'bounded-lines-'+count});const p=await prepare(req);expect(p.status,JSON.stringify(p.body)).toBe(200);
    const response=await confirm(req,p.body.acceptanceToken);expect(response.status,JSON.stringify(response.body)).toBe(200);
    const order=await prisma.order.findUniqueOrThrow({where:{id:response.body.orderId},include:{items:true}});expect(order.items).toHaveLength(count);expect(order.totalAmount.toString()).toBe(String(count*12750));expect(order.items.every(i=>(i.options as any).configurationSnapshot.snapshotVersion===2)).toBe(true);
  });
  it('keeps committed Snapshot2 and WhatsApp text immutable after a later catalog edit',async()=>{
    const req=await currentRequest(),p=await prepare(req),r=await confirm(req,p.body.acceptanceToken);expect(r.status).toBe(200);const where={id:r.body.orderId};const before=await prisma.order.findUniqueOrThrow({where,include:{items:true}});
    const old=await prisma.product.findUniqueOrThrow({where:{id:'ordering-pizza'}});try{await prisma.product.update({where:{id:old.id},data:{name:'Later catalog name'}});const after=await prisma.order.findUniqueOrThrow({where,include:{items:true}});expect(after.cartSnapshot).toEqual(before.cartSnapshot);expect(after.whatsappMessage).toBe(before.whatsappMessage);expect(after.items[0].options).toEqual(before.items[0].options);}finally{await prisma.product.update({where:{id:old.id},data:{name:old.name}});}
  });
  it.each(['P2034','40001','40P01','23505','P2002','unrelated'])('fails closed on Confirm storage failure %s without leaking or partially committing',async code=>{
    const req=await currentRequest(),p=await prepare(req),before=await prisma.order.count(),real=prisma.$transaction.bind(prisma);
    const spy=vi.spyOn(prisma,'$transaction').mockImplementation(((work:any,options:any)=>real(async tx=>{
      await tx.$executeRaw`INSERT INTO "AnalyticsEvent" ("id","restaurantId","type","createdAt") VALUES ('closure-confirm-rollback','ordering-restaurant','SYNTHETIC',NOW())`;
      if(code==='unrelated')throw new Error('synthetic private storage error');
      if(code==='P2034'||code==='P2002')throw new Prisma.PrismaClientKnownRequestError('synthetic private storage error',{code,clientVersion:'5.22.0'});
      await tx.$executeRawUnsafe(`DO $$ BEGIN RAISE EXCEPTION 'synthetic private storage error' USING ERRCODE='${code}'; END $$`);return work(tx);
    },options)) as any);
    try {const r=await confirm(req,p.body.acceptanceToken);expect(r.status).toBe(503);expect(JSON.stringify(r.body)).not.toMatch(/synthetic|Prisma|stack|23505|P2034|P2002/);expect(await prisma.order.count()).toBe(before);expect(await prisma.analyticsEvent.count({where:{id:'closure-confirm-rollback'}})).toBe(0);}finally{spy.mockRestore();}
  });
  it('does not retry or mislabel an unrelated Prepare storage failure as a conflict',async()=>{
    const req=await currentRequest(),real=prisma.$transaction.bind(prisma);let attempts=0;
    const spy=vi.spyOn(prisma,'$transaction').mockImplementation(((work:any,options:any)=>real(async()=>{attempts++;throw new Error('synthetic private prepare error');},options)) as any);
    try{const r=await prepare(req);expect(r.status).toBe(500);expect(attempts).toBe(1);expect(JSON.stringify(r.body)).not.toMatch(/synthetic|Prisma|stack/);}finally{spy.mockRestore();}
  });

 // V1 retirement: exercise the supported V2 entry points and reject unsupported wire shapes.
 it.each(['quote','prepare','editor'])('rejects unsupported V1 through %s without writes',async endpoint=>{
  const before=await prisma.product.findUniqueOrThrow({where:{id:'ordering-pizza'}}),orders=await prisma.order.count();
  const selection:any=((await currentLine()) as {selection:ProductSelectionV2}).selection;selection.schemaVersion=1;
  let r:any;
  if(endpoint==='quote')r=await quote(selection);
  else if(endpoint==='prepare')r=await prepare(request([line(selection)]));
  else{const current=(await http('/dashboard/products/ordering-pizza/editor',undefined,'GET',true)).body;
   r=await http('/dashboard/products/ordering-pizza/editor',{create:false,expectedProductVersion:current.editVersion,expectedConfigurationVersion:current.configurationVersion,product:current.product,configuration:{...current.configuration,schemaVersion:1}},'PUT',true);}
  expect(r.status).toBe(400);expect(await prisma.order.count()).toBe(orders);
  expect(await prisma.product.findUniqueOrThrow({where:{id:'ordering-pizza'}})).toEqual(before);
 });
 it('preserves V2 data and denies editor writes after capability loss',async()=>{
  const current=(await http('/dashboard/products/ordering-pizza/editor',undefined,'GET',true)).body;
  const changed=clone(current.configuration);changed.revision=current.configurationVersion+1;changed.groups[0].sizes[0].price='11001';
  await prisma.subscriptionFeature.updateMany({where:{planId:'ordering-plan',key:'PRODUCT_CONFIGURATION'},data:{enabled:false}});
  try{const r=await http('/dashboard/products/ordering-pizza/editor',{create:false,expectedProductVersion:current.editVersion,expectedConfigurationVersion:current.configurationVersion,product:{...current.product,name:'Must not save'},configuration:changed},'PUT',true);
   expect(r.status).toBe(403);expect((await http('/dashboard/products/ordering-pizza/editor',undefined,'GET',true)).body).toEqual(current);
  }finally{await prisma.subscriptionFeature.updateMany({where:{planId:'ordering-plan',key:'PRODUCT_CONFIGURATION'},data:{enabled:true}});}
 });
 it('preserves zero ordinary pricing and tenant isolation after V1 retirement',async()=>{
  const row=await prisma.product.findUniqueOrThrow({where:{id:ordinary.productId}});
  try{await prisma.product.update({where:{id:row.id},data:{basePrice:'0'}});
   const r=await http('/public/menus/ordering-restaurant/orders/whatsapp',{items:[{productSlug:ordinary.productSlug,productId:row.id,quantity:1,expectedUnitPrice:'0'}],fulfillmentType:'pickup',idempotencyKey:randomUUID()});
   expect(r.status).toBe(201);expect((await prisma.order.findUniqueOrThrow({where:{id:r.body.orderId}})).totalAmount.toString()).toBe('0');
   expect((await http('/public/menus/ordering-other/orders/whatsapp',{items:[{productSlug:ordinary.productSlug,productId:row.id,quantity:1,expectedUnitPrice:'0'}],fulfillmentType:'pickup'})).status).not.toBe(201);
  }finally{await prisma.product.update({where:{id:row.id},data:{basePrice:row.basePrice}});}
 });
 it('binds delivery and customer details to V2 acceptance without partial persistence',async()=>{
  const req=await currentRequest({fulfillmentType:'delivery',deliveryArea:'Synthetic area',deliveryNear:'Synthetic street',deliveryBeside:'Synthetic landmark',customerName:'Synthetic customer',customerPhone:'15555550123',orderNote:'Synthetic note'});
  const p=await prepare(req);expect(p.status).toBe(200);const before=await prisma.order.count();
  for(const change of [{customerName:'Different'},{deliveryArea:'Different'},{orderNote:'Different'}])expect((await confirm({...req,...change},p.body.acceptanceToken)).status).toBe(409);
  expect(await prisma.order.count()).toBe(before);
  const confirmed=await confirm(req,p.body.acceptanceToken);expect(confirmed.status).toBe(200);
  const row=await prisma.order.findUniqueOrThrow({where:{id:confirmed.body.orderId}});
  expect(JSON.stringify(row.cartSnapshot)).toContain('Synthetic area');expect(row.whatsappMessage).toContain('Synthetic note');
 });

 it('measures V2 Quote and Prepare at 10, 100 and 1000 catalog products without order writes',async()=>{
  const measurements=[];const orders=await prisma.order.count();
  try{for(const count of [10,100,1000]){
   await prisma.product.deleteMany({where:{id:{startsWith:'retirement-bench-'}}});
   await prisma.product.createMany({data:Array.from({length:count},(_,i)=>({id:'retirement-bench-'+i,restaurantId:'ordering-restaurant',categoryId:'ordering-category',name:'Synthetic benchmark '+i,slug:'retirement-bench-'+i,basePrice:'100',currency:'SYP'}))});
   const req=await currentRequest(),start=performance.now(),q=await quote((req.items[0] as any).selection),quoted=performance.now(),p=await prepare(req);
   expect(q.status).toBe(200);expect(p.status).toBe(200);expect(q.body.trustedTotal).toBe('12750');
   measurements.push({additionalProducts:count,quoteMs:quoted-start,prepareMs:performance.now()-quoted});
  }expect(await prisma.order.count()).toBe(orders);
   console.info('V2_CATALOG_MEASUREMENTS',JSON.stringify(measurements));
  }finally{await prisma.product.deleteMany({where:{id:{startsWith:'retirement-bench-'}}});}
 },30000);
 it('publishes Mood/New/Popular independently through the real editor and public menu',async()=>{
  const page=await prisma.menuPage.findFirstOrThrow({where:{menu:{restaurantId:'ordering-restaurant'},isHome:true}});
  await prisma.menuSection.createMany({data:[
   {pageId:page.id,type:'MOOD_STRIP',sortOrder:0,settings:{moodItems:[{key:'cheese-lovers',label:'عشاق الجبنة'},{key:'BBQ',label:'BBQ'}]}},
   {pageId:page.id,type:'HERO',sortOrder:1,settings:{adBanners:[{imageUrl:'/assets/public/demo-pizza-cheese.jpg',title:'عرض اليوم',isActive:true}]}},
   {pageId:page.id,type:'FEATURED_PRODUCTS',sortOrder:2,settings:{title:'الأكثر طلبًا',cardVariant:'wide-image'}}
  ]});
  const cases=[{moodKeys:['cheese-lovers'],isNew:false,isPopular:false},{moodKeys:['cheese-lovers','BBQ'],isNew:false,isPopular:false},
   {moodKeys:[],isNew:false,isPopular:false},{moodKeys:[],isNew:true,isPopular:false},{moodKeys:['cheese-lovers'],isNew:false,isPopular:true},
   {moodKeys:['BBQ'],isNew:true,isPopular:false},{moodKeys:['cheese-lovers','BBQ'],isNew:true,isPopular:true}];
  for(const [i,flags]of cases.entries()){
   const r=await http('/dashboard/products/mood-case-'+i+'/editor',{create:true,expectedProductVersion:0,expectedConfigurationVersion:0,
    product:{name:'Mood Case '+i,description:'Synthetic independent flags',categoryId:'ordering-category',basePrice:'200',isFeatured:false,...flags,images:[],ingredients:[],mealDetails:[]}},'PUT',true);
   expect(r.status,JSON.stringify(r.body)).toBe(200);
  }
  const published=await http('/dashboard/builder/publish',{},'POST',true);expect(published.status,JSON.stringify(published.body)).toBe(201);
  const publicMenu=await http('/public/menus/ordering-restaurant',undefined,'GET');expect(publicMenu.status).toBe(200);
  expect(publicMenu.body.menus.flatMap((m:any)=>m.pages).flatMap((p:any)=>p.sections).some((s:any)=>s.type==='MOOD_STRIP')).toBe(true);
  for(const [i,flags]of cases.entries())expect(publicMenu.body.products.find((p:any)=>p.id==='mood-case-'+i)).toMatchObject({...flags,isFeatured:false});
 });
 it('preserves fee/currency semantics and publishes social settings independently through real HTTP',async()=>{
  const before=(await http('/dashboard/settings',undefined,'GET',true)).body.restaurant;
  try{
   for(const fee of ['1750','0',null]){
    const saved=await http('/dashboard/settings',{deliveryFee:fee,whatsappPhone:'+49 (170) 123-4567',instagramUrl:'https://instagram.com/order-demo',facebookUrl:'https://facebook.com/order-demo',tiktokUrl:'https://tiktok.com/@order-demo',whatsappUrl:'https://wa.me/999999999'},'PATCH',true);
    expect(saved.status,JSON.stringify(saved.body)).toBe(200);expect(saved.body.restaurant.currency).toBe(before.currency);expect(saved.body.restaurant.deliveryFee).toBe(fee);
    const menu=await http('/public/menus/ordering-restaurant');expect(menu.body.restaurant).toMatchObject({whatsappPhone:'+49 (170) 123-4567',instagramUrl:'https://instagram.com/order-demo',facebookUrl:'https://facebook.com/order-demo',tiktokUrl:'https://tiktok.com/@order-demo'});
   }
  }finally{expect((await http('/dashboard/settings',{whatsappPhone:before.whatsappPhone??'',instagramUrl:before.instagramUrl??'',facebookUrl:before.facebookUrl??'',tiktokUrl:before.tiktokUrl??'',whatsappUrl:before.whatsappUrl??'',deliveryFee:before.deliveryFee},'PATCH',true)).status).toBe(200)}
 });
 it.skipIf(!process.env.ORDERING_BROWSER_SCRIPT)('runs production browser ordering against the same HTTP API and owned PostgreSQL',async()=>{const r=await promisify(execFile)(process.execPath,[process.env.ORDERING_BROWSER_SCRIPT!],{env:{...process.env,ORDERING_API_ORIGIN:origin,ORDERING_OWNER_TOKEN:owner},windowsHide:true,maxBuffer:2*1024*1024,timeout:480000+Number(process.env.ORDERING_DEMO_SECONDS??0)*1000});expect(r.stdout).toContain('ORDERING_BROWSER_PASS');},490000+Number(process.env.ORDERING_DEMO_SECONDS??0)*1000);
});
