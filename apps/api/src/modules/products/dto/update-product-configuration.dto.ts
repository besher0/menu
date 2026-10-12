import { Type } from "class-transformer";
import { IsInt, IsObject, Min } from "class-validator";
import { ProductConfigurationV1 } from "@menu/shared";

export class UpdateProductConfigurationDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @IsObject()
  configuration: ProductConfigurationV1;
}
