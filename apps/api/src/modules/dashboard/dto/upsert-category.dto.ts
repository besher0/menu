import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class UpsertCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imagePosition?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsIn(["COLOR", "IMAGE", "TEXTURE", "PATTERN", "GRADIENT"])
  backgroundType?: "COLOR" | "IMAGE" | "TEXTURE" | "PATTERN" | "GRADIENT";

  @IsOptional()
  @IsString()
  backgroundValue?: string;

  @IsOptional()
  @IsString()
  backgroundOverlay?: string;

  @IsOptional()
  @IsString()
  backgroundCss?: string;

  @IsOptional()
  @IsBoolean()
  visualScrollEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
