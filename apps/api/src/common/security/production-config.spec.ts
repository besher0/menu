import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { JwtService } from "@nestjs/jwt";
import type { ExecutionContext } from "@nestjs/common";
import type { PrismaService } from "../../modules/prisma/prisma.service";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { credentialVersion } from "./session-credential";
import { checkoutSigningKey, validateProductionConfig } from "./production-config";
import { disposableSeedDatabase } from "./disposable-seed";

const key = () => randomBytes(32).toString("hex");
function production() {
  return { NODE_ENV:"production", JWT_SECRET:key(), DATABASE_URL:"postgresql://service@127.0.0.1/app" };
}
describe("production credential gates", () => {
  it("allows configured application credentials and independent optional checkout signing", () => {
    const env=production();
    expect(()=>validateProductionConfig(env)).not.toThrow();
    expect(()=>validateProductionConfig({...env, ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT:"1",PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY:key()})).not.toThrow();
  });
  it.each(["", "not-a-url", "postgresql://fixture@pooler_host/app","postgresql://u51qa@127.0.0.1/ordersawa_stage3_test"])("rejects missing, malformed or fixture database inputs safely (%#)", value => {
    expect(()=>validateProductionConfig({...production(),DATABASE_URL:value})).toThrow(/^DATABASE_URL must identify/);
  });
  it("never includes the supplied connection string or password in validation errors", () => {
    const marker=key(); const url="postgresql://u51qa:"+marker+"@127.0.0.1/fixture";
    expect(()=>validateProductionConfig({...production(),DIRECT_URL:url})).toThrow(/^DIRECT_URL must identify a configured PostgreSQL application database$/);
  });
  it.each([{SEED_DEMO_RESTAURANT:"true"},{ENABLE_DISPOSABLE_NETWORK_ORDERS:"1"}])("rejects disposable switches in production", flags=>{
    expect(()=>validateProductionConfig({...production(),...flags})).toThrow();
  });
  it("rejects missing, weak, repeated, odd-length and reused signing material", () => {
    const env=production();
    for(const secret of [undefined,"abc","ab".repeat(32),"1234567890abcdef".repeat(4)])
      expect(()=>validateProductionConfig({...env,JWT_SECRET:secret})).toThrow();
    for(const secret of [undefined,key()+"f","ff".repeat(32),env.JWT_SECRET,Buffer.from(env.JWT_SECRET).toString("hex")])
      expect(()=>validateProductionConfig({...env,ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT:"1",PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY:secret})).toThrow();
    expect(checkoutSigningKey(key())?.length).toBe(32);
  });
  it("restricts demo provisioning to a dedicated matching local target, even in development",()=>{
    const url="postgresql://fixture@127.0.0.1:6000/ordersawa_disposable_rc2";
    expect(disposableSeedDatabase({NODE_ENV:"test", DATABASE_URL:url,DIRECT_URL:url})).toBe("ordersawa_disposable_rc2");
    for(const target of [url.replace("127.0.0.1","example.invalid"),url.replace("disposable_",""),url+"?host=example.invalid"])
      expect(()=>disposableSeedDatabase({NODE_ENV:"development",DATABASE_URL:target,DIRECT_URL:target})).toThrow();
    expect(()=>disposableSeedDatabase({NODE_ENV:"production",DATABASE_URL:url,DIRECT_URL:url})).toThrow();
    expect(()=>disposableSeedDatabase({NODE_ENV:"test",DATABASE_URL:url})).toThrow();
  });
  it("requires the credential binding, expiry, approved algorithm, valid lifetime and signature",async()=>{
    const jwt=new JwtService({secret:key()});const other=new JwtService({secret:key()});
    const hash=key();const payload={sub:"fixture",cv:credentialVersion(hash)};
    const guard=new JwtAuthGuard(jwt,{user:{findUnique:async()=>({id:"fixture",role:"USER",passwordHash:hash})}} as unknown as PrismaService);
    const call=(token:string)=>guard.canActivate({switchToHttp:()=>({getRequest:()=>({headers:{authorization:"Bearer "+token}})})} as ExecutionContext);
    await expect(call(await jwt.signAsync(payload,{expiresIn:"7d"}))).resolves.toBe(true);
    for(const token of [jwt.sign(payload),jwt.sign({sub:"fixture"},{expiresIn:"7d"}),jwt.sign(payload,{expiresIn:-1}),jwt.sign(payload,{algorithm:"HS384",expiresIn:"7d"}),other.sign(payload,{expiresIn:"7d"})])
      await expect(call(token)).rejects.toMatchObject({status:401});
  });
});
