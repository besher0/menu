import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateThemeDto {
  @IsObject()
  settings!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  customCss?: string;
}
