import { IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, Min } from "class-validator";

type IngredientInput = string | {
  name?: string;
  imageUrl?: string | null;
};

type ProductImageInput = {
  url?: string;
  altText?: string | null;
};

export class CreateProductDto {
  // POST-only intent. The product remains a hidden Legacy shell until its tree is saved.
  @IsOptional()
  @IsIn(["NETWORK_SETUP"])
  configurationIntent?: "NETWORK_SETUP";

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  images?: ProductImageInput[];

  @IsOptional()
  @IsString()
  moodKey?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moodKeys?: string[];

  @IsOptional()
  @IsArray()
  ingredients?: IngredientInput[];

  @IsOptional()
  @IsObject()
  nutrition?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  model3dUrl?: string;

  @IsOptional()
  @IsString()
  model3dFormat?: string;

  @IsOptional()
  @IsString()
  vrUrl?: string;

  @IsOptional()
  @IsString()
  vrType?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isNew?: boolean;

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;
}
