import { IsBoolean, IsInt, IsObject, IsOptional, Min } from "class-validator";

export class UpdateSectionDto {
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
