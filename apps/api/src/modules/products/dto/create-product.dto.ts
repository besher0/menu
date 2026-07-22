import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, Min } from "class-validator";

type IngredientInput = string | {
  name?: string;
  imageUrl?: string | null;
};

export class CreateProductDto {
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

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  moodKey?: string;

  @IsOptional()
  @IsArray()
  ingredients?: IngredientInput[];

  @IsOptional()
  @IsObject()
  nutrition?: Record<string, string>;

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
