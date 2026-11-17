import "reflect-metadata";
import { randomBytes,randomUUID } from "node:crypto";
import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from "vitest";
import { Module,ValidationPipe,type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule,JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { credentialVersion } from "../../common/security/session-credential";
import { ApiResponseInterceptor } from "../../common/api-response.interceptor";
import { FeedbackService } from "./feedback.service";
import { FeedbackIpGuard,DashboardFeedbackController,PublicFeedbackController } from "./feedback.module";
import { DashboardService } from "../dashboard/dashboard.service";
import { DashboardController } from "../dashboard/dashboard.controller";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PublicMenuController } from "../public-menu/public-menu.controller";
import { PublicMenuService } from "../public-menu/public-menu.service";
import { PublicWhatsappCheckoutService } from "../public-menu/public-whatsapp-checkout.service";
const url=process.env.ORDERING_TEST_DATABASE_URL;
describe.skipIf(!url)("Unified feedback / owned PostgreSQL + real HTTP",()=>{
 const prisma=new PrismaClient({datasourceUrl:url});let app:INestApplication,origin:string,owner:string,staff:string,other:string,admin:string;
 const secret=randomBytes(32).toString("hex");
 const body=(stars=5,extra={})=>({stars,requestId:randomUUID(),clientId:randomUUID(),...extra});
 async function http(path:string,value?:unknown,token?:string,restaurantId="feedback-r",method=value===undefined?"GET":"POST"){
  const response=await fetch(origin+path,{method,headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token,"x-restaurant-id":restaurantId}:{})},...(value===undefined?{}:{body:JSON.stringify(value)})});
  const raw=await response.json();return {status:response.status,body:raw.data??raw};
 }
 const submit=(value:unknown,slug="feedback-r")=>http(`/public/menus/${slug}/feedback`,value);
 const setting=(value:unknown,token=owner,restaurantId="feedback-r")=>http("/dashboard/settings",value,token,restaurantId,"PATCH");
 beforeAll(async()=>{
  if(!url)throw Error("Owned PostgreSQL required");const u=new URL(url);
  if(u.hostname!=="127.0.0.1"||u.port!==process.env.ORDERING_TEST_PORT||!/^\/ordering_v2_[a-f0-9]+$/.test(u.pathname))throw Error("Refusing non-disposable database");
  const location=await prisma.$queryRawUnsafe<Array<{data_directory:string}>>("SHOW data_directory");
  if(location[0].data_directory.replaceAll('\\','/').toLowerCase()!==process.env.ORDERING_TEST_DATA_DIRECTORY?.replaceAll('\\','/').toLowerCase())throw Error("Database identity mismatch");
  await prisma.restaurant.createMany({data:[{id:"feedback-r",slug:"feedback-r",name:"Synthetic Feedback",description:"نبذة المطعم",currency:"SYP",whatsappPhone:"491701234567"},{id:"feedback-other",slug:"feedback-other",name:"Other synthetic",currency:"USD"}]});
  await prisma.branch.create({data:{restaurantId:"feedback-r",name:"Main",slug:"main",address:"عنوان تجريبي",latitude:33.5138,longitude:36.2765}});
  await prisma.menu.create({data:{restaurantId:"feedback-r",name:"Test",slug:"test",pages:{create:{title:"Home",slug:"home",isHome:true}}}});
  for(const [id,role,restaurantRole,restaurantId] of [["feedback-owner","USER","OWNER","feedback-r"],["feedback-staff","USER","EMPLOYEE","feedback-r"],["feedback-other-owner","USER","OWNER","feedback-other"],["feedback-admin","SUPER_ADMIN",null,null]] as const){
   await prisma.user.create({data:{id,email:id+"@example.invalid",passwordHash:secret,role}});
   if(restaurantRole)await prisma.restaurantMember.create({data:{userId:id,restaurantId:restaurantId!,role:restaurantRole}});
  }
  @Module({imports:[JwtModule.register({secret,signOptions:{expiresIn:"1h"}})],controllers:[PublicFeedbackController,DashboardFeedbackController,DashboardController,PublicMenuController],providers:[FeedbackIpGuard,FeedbackService,JwtAuthGuard,RestaurantContextGuard,DashboardService,FeatureFlagsService,PublicMenuService,PublicWhatsappCheckoutService,{provide:PrismaService,useValue:prisma},{provide:ConfigService,useValue:{get:(key:string)=>key==="JWT_SECRET"?secret:key==="API_ORIGIN"?origin:undefined}}]})class TestModule{}
  app=await NestFactory.create(TestModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidUnknownValues:true}));app.useGlobalInterceptors(new ApiResponseInterceptor());await app.listen(0,"127.0.0.1");origin="http://127.0.0.1:"+app.getHttpServer().address().port;
  const token=(id:string)=>app.get(JwtService).signAsync({sub:id,cv:credentialVersion(secret)});
  [owner,staff,other,admin]=await Promise.all(["feedback-owner","feedback-staff","feedback-other-owner","feedback-admin"].map(token));
 },30000);
 beforeEach(async()=>{await prisma.feedbackQuotaEvent.deleteMany();});
 afterAll(async()=>{await app?.close();await prisma.$disconnect();});
 it.each([1,2,3])("rejects empty/whitespace comment at %s stars",async stars=>{expect((await submit(body(stars,{comment:"  "}))).status).toBe(400);});
 it.each([2,3])("saves required comments at %s stars",async stars=>{expect((await submit(body(stars,{comment:"ملاحظة "+stars}))).status).toBe(200);});
 it.each([4,5])("accepts anonymous positive %s without a comment",async stars=>{
  const value=body(stars);expect((await submit(value)).body).toEqual({accepted:true});
  const stored=await prisma.restaurantFeedback.findUniqueOrThrow({where:{restaurantId_requestId:{restaurantId:"feedback-r",requestId:value.requestId}}});
  expect(stored.customerName).toBeNull();expect(stored.customerPhone).toBeNull();expect(stored.comment).toBeNull();expect(stored.createdAt).toBeInstanceOf(Date);
 });
 it.each([{customerName:"اسم تجريبي"},{customerPhone:"+49 170 1234567"},{customerName:"اسم",customerPhone:"0049 170 1234567"}])("stores only voluntarily supplied contacts %j",async contact=>{
  const value=body(5,contact);expect((await submit(value)).status).toBe(200);const record=await prisma.restaurantFeedback.findUniqueOrThrow({where:{restaurantId_requestId:{restaurantId:"feedback-r",requestId:value.requestId}}});expect(record).toMatchObject(contact);
 });
 it.each([{stars:0},{stars:6},{stars:1.5},{stars:"5"},{comment:"x".repeat(2001)},{customerName:"x".repeat(101)},{customerPhone:"javascript:alert(1)"},{requestId:"bad"},{clientId:"bad"}])("rejects malformed or oversized input %j",async patch=>expect((await submit(body(5,patch))).status).toBe(400));
 it("deduplicates retries, concurrent requests and changed UUIDs from one visitor without merging other visitors",async()=>{
  const value=body(5,{comment:"same payload"}),before=await prisma.restaurantFeedback.count();
  const results=await Promise.all(Array.from({length:4},()=>submit(value)));expect(results.every(r=>r.status===200)).toBe(true);
  expect((await submit({...value,requestId:randomUUID()})).status).toBe(200);expect(await prisma.restaurantFeedback.count()).toBe(before+1);
  expect((await submit({...value,requestId:randomUUID(),clientId:randomUUID()})).status).toBe(200);expect(await prisma.restaurantFeedback.count()).toBe(before+2);
  expect((await submit({...value,comment:"different"})).status).toBe(409);
 });
 it("keeps contacts private, paginates chronologically and enforces current tenant/role boundaries",async()=>{
  const own=await http("/dashboard/feedback",undefined,owner);expect(own.status).toBe(200);expect(own.body.items.some((x:any)=>x.customerName)).toBe(true);
  expect(own.body.items.every((x:any,i:number,a:any[])=>!i||new Date(a[i-1].createdAt)>=new Date(x.createdAt))).toBe(true);
  expect((await http("/dashboard/feedback")).status).toBe(401);
  expect((await http("/dashboard/feedback",undefined,other)).status).toBe(403);
  expect((await http("/dashboard/feedback",undefined,staff)).status).toBe(403);
  expect((await http("/dashboard/feedback",undefined,other,"feedback-other")).body.items).toEqual([]);
  expect((await http("/dashboard/feedback",undefined,admin)).status).toBe(200);
  expect((await http("/dashboard/feedback?page=-1",undefined,owner)).status).toBe(400);
  const menu=await http("/public/menus/feedback-r");expect(menu.status).toBe(200);expect(JSON.stringify(menu.body)).not.toContain("customerPhone");expect(JSON.stringify(menu.body)).not.toContain("customerName");
  expect((await http("/public/menus/feedback-r/feedback")).status).toBe(404);
 });
 it("preserves exact existing branch location and switches delivery policy only with restaurant permissions",async()=>{
  expect((await setting({feedbackMode:"DASHBOARD",latitude:null,longitude:null},other,"feedback-other")).status).toBe(200);
  expect((await setting({feedbackMode:"WHATSAPP"},other)).status).toBe(403);
  expect((await setting({feedbackMode:"WHATSAPP"},staff)).status).toBe(403);
  expect((await setting({latitude:91,longitude:36})).status).toBe(400);
  expect((await setting({latitude:null})).status).toBe(400);
  expect((await setting({feedbackMode:"WHATSAPP",description:"نبذة جديدة",latitude:0,longitude:0})).status).toBe(200);
  const before=await prisma.restaurantFeedback.count();expect((await submit(body())).status).toBe(409);expect(await prisma.restaurantFeedback.count()).toBe(before);
  const menu=await http("/public/menus/feedback-r");expect(menu.body.restaurant.feedbackMode).toBe("WHATSAPP");expect(menu.body.restaurant.branches[0]).toMatchObject({latitude:0,longitude:0,address:"عنوان تجريبي"});
  expect((await setting({latitude:null,longitude:null,feedbackMode:"DASHBOARD"})).status).toBe(200);
  expect((await submit(body())).status).toBe(200);
 });
 it("rejects missing/inactive restaurants without writing feedback",async()=>{
  const count=await prisma.restaurantFeedback.count();expect((await submit(body(),"missing-feedback")).status).toBe(404);
  await prisma.restaurant.update({where:{id:"feedback-other"},data:{isActive:false}});expect((await submit(body(),"feedback-other")).status).toBe(404);expect(await prisma.restaurantFeedback.count()).toBe(count);
 });
 it("fails closed on storage errors, hides private diagnostics and retries the same request safely",async()=>{
  const value=body(5,{comment:"storage retry synthetic"}),count=await prisma.restaurantFeedback.count();
  const spy=vi.spyOn(prisma,"$transaction").mockRejectedValueOnce(new Error("PRIVATE_CONTACT_SENTINEL"));
  try{const failed=await submit(value);expect(failed.status).toBe(503);expect(JSON.stringify(failed.body)).not.toContain("PRIVATE_CONTACT_SENTINEL");expect(await prisma.restaurantFeedback.count()).toBe(count);}
  finally{spy.mockRestore();}
  expect((await submit(value)).status).toBe(200);expect(await prisma.restaurantFeedback.count()).toBe(count+1);
 });
 it("enforces three successful submissions, excludes validation failures, permits duplicate retry and expires after 12 hours",async()=>{
  const clientId=randomUUID();expect((await submit(body(1,{clientId}))).status).toBe(400);
  const values=[1,2,3].map(n=>body(5,{clientId,comment:"rolling "+n}));
  for(const value of values) expect((await submit(value)).status).toBe(200);
  expect((await submit(values[0])).status).toBe(200);
  expect((await submit(body(5,{clientId,comment:"fourth"}))).status).toBe(429);
  expect((await submit(body(5,{comment:"another visitor behind same IP"}))).status).toBe(200);
  await prisma.feedbackQuotaEvent.updateMany({data:{expiresAt:new Date(Date.now()-1)}});
  expect((await submit(body(5,{clientId,comment:"after expiry"}))).status).toBe(200);
 });
 it("serializes concurrent successes to exactly three and scopes quota by tenant",async()=>{
  await prisma.restaurant.update({where:{id:"feedback-other"},data:{isActive:true}});
  const clientId=randomUUID(),count=await prisma.restaurantFeedback.count();
  const responses=await Promise.all(Array.from({length:7},(_,i)=>submit(body(5,{clientId,comment:"concurrent "+i}))));
  expect(responses.filter(r=>r.status===200)).toHaveLength(3);expect(responses.filter(r=>r.status===429)).toHaveLength(4);
  expect(await prisma.restaurantFeedback.count()).toBe(count+3);
  expect((await submit(body(5,{clientId,comment:"different restaurant"}),"feedback-other")).status).toBe(200);
 });
 it("shares twenty IP attempts across validation failures and workers; deleting visitor storage does not bypass IP cap",async()=>{
  for(let i=0;i<20;i++)expect((await submit(body(1))).status).toBe(400);
  const rejected=await submit(body());expect(rejected.status).toBe(429);expect(rejected.body.error).toBe("FEEDBACK_IP_LIMIT");
  expect((await submit(body(),"feedback-other")).status).toBe(200);
  const secondWorker=new FeedbackService(prisma as any,{get:()=>secret} as any);
  await expect(secondWorker.limitIp("feedback-r","127.0.0.1")).rejects.toMatchObject({status:429});
  await expect(secondWorker.limitIp("feedback-r","192.0.2.22")).resolves.toBeUndefined();
 });
 it("validates Maps URL independently from existing coordinates and preserves geographic data",async()=>{
  const before=await prisma.branch.findFirstOrThrow({where:{restaurantId:"feedback-r"}});
  expect((await setting({googleMapsUrl:"https://google.com.evil.test/maps"})).status).toBe(400);
  expect((await setting({googleMapsUrl:"https://maps.app.goo.gl/Synthetic"})).status).toBe(200);
  expect((await http("/public/menus/feedback-r")).body.restaurant.googleMapsUrl).toBe("https://maps.app.goo.gl/Synthetic");
  const after=await prisma.branch.findFirstOrThrow({where:{restaurantId:"feedback-r"}});expect(after.latitude).toBe(before.latitude);expect(after.longitude).toBe(before.longitude);
  expect((await setting({googleMapsUrl:""})).status).toBe(200);expect((await http("/public/menus/feedback-r")).body.restaurant.googleMapsUrl).toBeNull();
 });
 it("enforces stars/comment database constraints even for a bypassing database writer",async()=>{
  const common={restaurantId:"feedback-r",requestId:randomUUID(),dedupeKey:randomBytes(32).toString("hex")};
  await expect(prisma.restaurantFeedback.create({data:{...common,stars:0}})).rejects.toThrow();
  await expect(prisma.restaurantFeedback.create({data:{...common,stars:2}})).rejects.toThrow();
 });
});
