import { IsNumber, Min } from "class-validator";

export class UpdateProductPriceDto {
  @IsNumber()
  @Min(0)
  basePrice: number;
}
