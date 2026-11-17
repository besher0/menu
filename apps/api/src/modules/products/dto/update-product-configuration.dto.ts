import { Type } from "class-transformer";
import { IsInt, IsObject, Min } from "class-validator";

export class UpdateProductConfigurationDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @IsObject()
  // This retired write endpoint always returns 410; it never interprets a tree.
  configuration: unknown;
}
