import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class SectionOrderDto {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderSectionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SectionOrderDto)
  sections: SectionOrderDto[];
}
