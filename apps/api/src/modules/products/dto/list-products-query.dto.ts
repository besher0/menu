import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
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
