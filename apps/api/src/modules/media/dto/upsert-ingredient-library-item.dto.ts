import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpsertIngredientLibraryItemDto {
  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
