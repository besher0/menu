import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Controller, Get, Module, Param, Query, ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IsInt, Min } from "class-validator";
import { Type } from "class-transformer";
import type { Request, Response, NextFunction } from "express";

class PageQuery {
  @Type(() => Number) @IsInt() @Min(1) page!: number;
}
@Controller("compat")
class CompatibilityController {
  @Get("query") query(@Query() query: Record<string, unknown>) { return query; }
  @Get("page/:id") page(@Param("id") id: string, @Query() query: PageQuery) { return {id, ...query}; }
}
@Module({controllers:[CompatibilityController]}) class CompatibilityModule {}

describe("Nest 11 / Express 5 HTTP compatibility",()=>{
 let app:INestApplication,origin:string;
 beforeAll(async()=>{
  app=await NestFactory.create(CompatibilityModule,{logger:false});
  app.getHttpAdapter().getInstance().set("query parser","extended");
  app.use((req:Request,res:Response,next:NextFunction)=>{res.setHeader("x-first","one");next();});
  app.use((req:Request,res:Response,next:NextFunction)=>{res.setHeader("x-order",res.getHeader("x-first")+"-two");next();});
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidUnknownValues:true}));
  await app.listen(0,"127.0.0.1");origin="http://127.0.0.1:"+app.getHttpServer().address().port;
 });
 afterAll(async()=>{await app?.close();});
 it("retains extended arrays and nested query parsing without prototype pollution",async()=>{
  const r=await fetch(origin+"/compat/query?tag[]=one&tag[]=two&filter[name]=meal&__proto__[polluted]=yes");
  expect(r.status).toBe(200);expect(await r.json()).toEqual({tag:["one","two"],filter:{name:"meal"}});
  expect(({} as Record<string,unknown>).polluted).toBeUndefined();expect(r.headers.get("x-order")).toBe("one-two");
 });
 it("preserves parameter routes, DTO transformation, whitelist and validation errors",async()=>{
  const r=await fetch(origin+"/compat/page/meal?page=2&extra=ignored");expect(r.status).toBe(200);expect(await r.json()).toEqual({id:"meal",page:2});
  expect((await fetch(origin+"/compat/page/meal?page=0")).status).toBe(400);
  expect((await fetch(origin+"/compat/page/meal?page[bad]=2")).status).toBe(400);
  expect((await fetch(origin+"/compat/missing")).status).toBe(404);
 });
});
