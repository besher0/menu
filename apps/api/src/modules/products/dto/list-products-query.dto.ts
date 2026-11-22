import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class ListProductsQueryDto {
  @IsOptional()
  @IsIn(["missingImage", "unavailable"])
  review?: "missingImage" | "unavailable";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(["all", "available", "unavailable"])
  availability?: "all" | "available" | "unavailable";

  @IsOptional()
  @IsIn(["sortOrder", "newest", "priceAsc", "priceDesc", "name"])
  sort?: "sortOrder" | "newest" | "priceAsc" | "priceDesc" | "name";

  @IsOptional()
  @IsString()
  search?: string;
}
