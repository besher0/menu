import { IsNumber, IsInt, Min } from "class-validator";

export class UpdateProductPriceDto {
  @IsInt() @Min(0)
  expectedProductVersion: number;
  @IsNumber()
  @Min(0)
  basePrice: number;
}
