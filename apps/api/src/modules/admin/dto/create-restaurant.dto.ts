import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { PUBLIC_TEMPLATE_KEYS, PublicTemplateKey } from "@menu/shared";

export class CreateRestaurantDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @IsOptional()
  @IsString()
  planKey?: string;

  @IsOptional()
  @IsString()
  copyFromRestaurantId?: string;

  @IsOptional()
  @IsIn(PUBLIC_TEMPLATE_KEYS)
  templateKey?: PublicTemplateKey;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(2)
  ownerName: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  ownerPassword?: string;
}
