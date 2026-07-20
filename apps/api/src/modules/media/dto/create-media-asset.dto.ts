import { IsIn, IsInt, IsOptional, IsString, IsUrl, Min } from "class-validator";

export class CreateMediaAssetDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsIn(["IMAGE", "MODEL_3D", "VR_PANORAMA", "SVG_ICON", "PNG_ICON"])
  type!: "IMAGE" | "MODEL_3D" | "VR_PANORAMA" | "SVG_ICON" | "PNG_ICON";

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  originalFilename?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number;
}
