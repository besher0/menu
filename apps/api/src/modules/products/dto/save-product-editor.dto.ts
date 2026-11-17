import { IsBoolean, IsInt, IsObject, IsOptional, Min } from "class-validator";
import type { SaveProductEditor } from "@menu/shared";

export class SaveProductEditorDto implements SaveProductEditor {
  @IsBoolean()
  create: boolean;
  @IsInt() @Min(0)
  expectedProductVersion: number;
  @IsInt() @Min(0)
  expectedConfigurationVersion: number;
  @IsObject()
  product: SaveProductEditor["product"];
  @IsOptional() @IsObject()
  configuration?: SaveProductEditor["configuration"];
  @IsOptional() @IsObject()
  advancedMedia?: SaveProductEditor["advancedMedia"];
}
