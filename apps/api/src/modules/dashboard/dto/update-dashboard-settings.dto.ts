import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
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

export class UpdateDashboardSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  address?: string;

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
  logoUrl?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  showPrices?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardOpeningHourDto)
  openingHours?: DashboardOpeningHourDto[];
}
