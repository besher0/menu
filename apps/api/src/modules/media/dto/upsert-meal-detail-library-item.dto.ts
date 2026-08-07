import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpsertMealDetailLibraryItemDto {
  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  value?: string | null;

  @IsOptional()
  @IsString()
  icon?: string | null;

  @IsOptional()
  @IsString()
  iconUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
