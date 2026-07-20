import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { BUILDER_SECTION_TYPES, BuilderSectionType } from "@menu/shared";

export class AddSectionDto {
  @IsString()
  pageId: string;

  @IsIn(BUILDER_SECTION_TYPES)
  type: BuilderSectionType;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
