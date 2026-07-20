import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

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
