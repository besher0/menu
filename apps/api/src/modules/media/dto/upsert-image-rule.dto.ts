import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpsertImageRuleDto {
  @IsIn(["PRODUCT_IMAGE", "CATEGORY_IMAGE", "HERO_IMAGE", "GALLERY_IMAGE", "LOGO", "ICON"])
  target!: "PRODUCT_IMAGE" | "CATEGORY_IMAGE" | "HERO_IMAGE" | "GALLERY_IMAGE" | "LOGO" | "ICON";

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  jpegQuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  webpQuality?: number;

  @IsOptional()
  @IsString()
  cropMode?: string;

  @IsOptional()
  @IsString()
  aspectRatio?: string;

  @IsOptional()
  @IsBoolean()
  generateAvif?: boolean;

  @IsOptional()
  @IsBoolean()
  generateWebp?: boolean;

  @IsOptional()
  @IsBoolean()
  lazyLoad?: boolean;

  @IsOptional()
  @IsBoolean()
  progressive?: boolean;
}
