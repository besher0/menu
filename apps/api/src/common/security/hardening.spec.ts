import { credentialVersion } from "./session-credential";
import { randomBytes } from "node:crypto";
import { ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { AppRequest } from "../app-request";
import { requireRestaurantPermission } from "../restaurant-permission";
import { signingKey } from "./jwt-key";
import { PrismaService } from "../../modules/prisma/prisma.service";
import { MediaService } from "../../modules/media/media.service";
import { ProductsService } from "../../modules/products/products.service";
import { checkWorkbookBudget } from "../../modules/products/import/product-import-parser";

describe("credential and tenant boundaries", () => {
  it("rejects absent, example and low-diversity signing keys", () => {
    for (const key of [undefined, "", "short", "a".repeat(64), "replace-me".repeat(8)]) {
      expect(() => signingKey(key)).toThrow();
    }
    const generated = randomBytes(32).toString("hex");
    expect(signingKey(generated)).toBe(generated);
  });

  it("uses the current role and rejects a removed identity", async () => {
    const jwt = new JwtService({ secret: randomBytes(32) });
    const findUnique = vi.fn().mockResolvedValueOnce({ id: "fixture", email: "test@example.test", role: "USER", passwordHash: "fixture-hash" }).mockResolvedValue(null);
    const guard = new JwtAuthGuard(jwt, { user: { findUnique } } as unknown as PrismaService);
    const request = { headers: { authorization: "Bearer " + await jwt.signAsync({ sub: "fixture", role: "SUPER_ADMIN", cv: credentialVersion("fixture-hash") }, { expiresIn: "7d" }) } } as AppRequest;
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.role).toBe("USER");
    await expect(guard.canActivate(context)).rejects.toMatchObject({status: 401});
  });

  it.each([["EMPLOYEE",false],["EDITOR",false],["MANAGER",false],["OWNER",true]] as const)(
    "checks the %s domain-management permission", (role,allowed) => {
      const check = () => requireRestaurantPermission({ restaurant: {role}, user: {role:"USER"} } as AppRequest, "domain.manage");
      if (allowed) expect(check).not.toThrow();
      else expect(check).toThrow();
    });

  it("resolves the category inside the same restaurant before a product write", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new ProductsService({category:{findFirst}} as unknown as PrismaService, {} as never, {} as never, {} as never);
    await expect(service.create("first", {name:"fixture",categoryId:"other"})).rejects.toMatchObject({status:400});
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:"other",restaurantId:"first",deletedAt:null}}));
  });

  it("requires the image reference to belong to the product tenant", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const tx = { product: { updateMany: async () => ({ count: 1 }) }, mediaAsset: { findFirst } };
    const db = { $transaction: async (write: (value: typeof tx) => Promise<unknown>) => write(tx) } as unknown as PrismaService;
    const service = new MediaService(db, {assertFeature: async()=>undefined} as never);
    await expect(service.attachImage("first","p",{url:"/fixture.png",mediaId:"other",expectedProductVersion:0})).rejects.toMatchObject({status:400});
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:"other",restaurantId:"first",url:"/fixture.png",type:{in:["IMAGE","PNG_ICON","SVG_ICON"]}}}));
  });

  it("counts the actual total expanded workbook bytes, including separate entries", async () => {
    const zip = new JSZip();
    zip.file("a.xml","abc");
    zip.file("b.xml","def");
    const bytes = await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
    await expect(checkWorkbookBudget(bytes,6)).resolves.toBeUndefined();
    await expect(checkWorkbookBudget(bytes,5)).rejects.toThrow("expansion limit");
  });
});
