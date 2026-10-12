import { IsInt, Min } from "class-validator";

export class UpdateProductSortDto {
  @IsInt()
  @Min(0)
  sortOrder: number;
}
