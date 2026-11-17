import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class DashboardOpeningHourDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day: number;

  @IsString()
  opensAt: string;

  @IsString()
  closesAt: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class SplashScreenSettingsDto {
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsIn(["COLOR", "IMAGE"])
  backgroundType?: "COLOR" | "IMAGE";

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  backgroundImageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  logoX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  logoY?: number;
}

export class UpdateDashboardSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @IsOptional()
  @IsIn(["DASHBOARD", "WHATSAPP"])
  feedbackMode?: "DASHBOARD" | "WHATSAPP";

  @IsOptional() @IsString() @MaxLength(2048)
  googleMapsUrl?: string;

  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  latitude?: number | null;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  tiktokUrl?: string;

  @IsOptional()
  @IsString()
  whatsappUrl?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  showPrices?: boolean;

  @IsOptional()
  @IsString()
  deliveryFee?: string | null;

  @IsOptional()
  @IsIn(["MODAL", "PAGE"])
  productOpenMode?: "MODAL" | "PAGE";

  @IsOptional()
  @ValidateNested()
  @Type(() => SplashScreenSettingsDto)
  splashScreen?: SplashScreenSettingsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardOpeningHourDto)
  openingHours?: DashboardOpeningHourDto[];
}
