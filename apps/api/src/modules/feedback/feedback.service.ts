import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { feedbackMode, feedbackRequiresComment } from "@menu/shared";
import { signingKey } from "../../common/security/jwt-key";
import { PrismaService } from "../prisma/prisma.service";

export class CreateFeedbackDto {
  @IsInt() @Min(1) @Max(5) stars!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @IsOptional() @IsString() @MaxLength(100) customerName?: string;
  @IsOptional() @IsString() @MaxLength(32) customerPhone?: string;
  @IsUUID("4") clientId!: string;
  @IsUUID("4") requestId!: string;
}

@Injectable()
export class FeedbackService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {}
  async submit(slug: string, dto: CreateFeedbackDto, ip: string) {
    const restaurant = await this.prisma.restaurant.findFirst({where:{slug,isActive:true,deletedAt:null},select:{id:true,themeSettings:{select:{settings:true}}}});
    if (!restaurant) throw new NotFoundException();
    const settings = restaurant.themeSettings?.settings as Record<string, any> | null;
    if (feedbackMode(settings?.dashboardSettings?.feedbackMode) !== "DASHBOARD") throw new ConflictException("Feedback delivery method changed");
    const comment = dto.comment?.trim() || null, customerName = dto.customerName?.trim() || null, customerPhone = dto.customerPhone?.trim() || null;
    if (feedbackRequiresComment(dto.stars) && !comment) throw new BadRequestException("A comment is required for this rating");
    if (customerPhone && (!/^\+?[\d\s().-]+$/.test(customerPhone) || !/^\d{6,20}$/.test(customerPhone.replace(/\D/g,"")))) throw new BadRequestException("Invalid phone number");
    if ([comment,customerName,customerPhone].some(value=>value && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))) throw new BadRequestException("Invalid text");
    const visitorKey = this.key(["visitor",restaurant.id,dto.clientId]);
    const dedupeKey = this.key(["content",restaurant.id,dto.clientId,Math.floor(Date.now()/300000),dto.stars,comment,customerName,customerPhone]);
    const data = {restaurantId:restaurant.id,stars:dto.stars,comment,customerName,customerPhone,requestId:dto.requestId,dedupeKey};
    try {
      await this.prisma.$transaction(async tx => {
        await this.lock(tx, visitorKey);
        const existing = await tx.restaurantFeedback.findFirst({where:{restaurantId:restaurant.id,OR:[{requestId:dto.requestId},{dedupeKey}]}});
        if (existing) {
          if(existing.stars!==data.stars || existing.comment!==comment || existing.customerName!==customerName || existing.customerPhone!==customerPhone)
            throw new ConflictException("Feedback request changed");
          return; // Idempotent retries do not consume successful-submission quota.
        }
        const now = new Date();
        if(await tx.feedbackQuotaEvent.count({where:{key:visitorKey,expiresAt:{gt:now}}})>=3)
          throw new HttpException({error:"FEEDBACK_VISITOR_LIMIT",message:"تم استلام ثلاثة تقييمات خلال 12 ساعة. حاول لاحقًا."},429);
        await tx.restaurantFeedback.create({data});
        await tx.feedbackQuotaEvent.create({data:{key:visitorKey,expiresAt:new Date(now.getTime()+12*60*60*1000)}});
      },{timeout:10000});
    } catch(error) {
      if(error instanceof HttpException) throw error;
      // Unique request IDs still protect against a concurrent retry with a replaced visitor ID.
      if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==="P2002") {
        try {
          const existing=await this.prisma.restaurantFeedback.findFirst({where:{restaurantId:restaurant.id,requestId:dto.requestId}});
          if(existing && existing.stars===data.stars && existing.comment===comment && existing.customerName===customerName && existing.customerPhone===customerPhone) return {accepted:true};
        } catch { /* Return only a sanitized failure below. */ }
      }
      throw new ServiceUnavailableException("Feedback is temporarily unavailable");
    }
    // No public read endpoint and no contact data in the receipt.
    return {accepted:true};
  }
  private key(parts: unknown[]) {
    return createHmac("sha256",signingKey(this.config.get<string>("JWT_SECRET"))).update(JSON.stringify(parts)).digest("hex");
  }
  private async lock(tx: Prisma.TransactionClient, key: string) {
    // Database-wide transaction lock, shared by all API workers, released on commit/rollback.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }
  async limitIp(slug: string, ip: string) {
    const restaurant=await this.prisma.restaurant.findFirst({where:{slug,isActive:true,deletedAt:null},select:{id:true}});
    if(!restaurant) throw new NotFoundException();
    const key=this.key(["ip",restaurant.id,ip]);
    try {
      await this.prisma.$transaction(async tx=>{
        await this.lock(tx,key);
        // Bounded lazy expiry; expired keys never affect a decision even if cleanup is delayed.
        await tx.$executeRaw`DELETE FROM "FeedbackQuotaEvent" WHERE "id" IN (SELECT "id" FROM "FeedbackQuotaEvent" WHERE "expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') LIMIT 200)`;
        const now=new Date();
        if(await tx.feedbackQuotaEvent.count({where:{key,expiresAt:{gt:now}}})>=20)
          throw new HttpException({error:"FEEDBACK_IP_LIMIT",message:"محاولات إرسال كثيرة. حاول بعد قليل."},429);
        await tx.feedbackQuotaEvent.create({data:{key,expiresAt:new Date(now.getTime()+10*60*1000)}});
      },{timeout:10000});
    } catch(error) {
      if(error instanceof HttpException) throw error;
      throw new ServiceUnavailableException("Feedback is temporarily unavailable");
    }
  }
  async list(restaurantId: string, page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new BadRequestException("Invalid page");
    const where={restaurantId};
    const [items,total]=await this.prisma.$transaction([
      this.prisma.restaurantFeedback.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:20,
        select:{id:true,stars:true,comment:true,customerName:true,customerPhone:true,createdAt:true}}),
      this.prisma.restaurantFeedback.count({where})
    ]);
    return {items,total,page,pages:Math.ceil(total/20)};
  }
}
