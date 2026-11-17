import { IsOptional, IsInt, Min, IsString, IsUrl } from "class-validator";

export class AttachProductImageDto {
  @IsInt() @Min(0)
  expectedProductVersion: number;
  @IsOptional()
  @IsString()
  mediaId?: string;

  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  altText?: string;
}

export class AttachProduct3dDto {
  @IsInt() @Min(0)
  expectedProductVersion: number;
  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  format?: string;
}

export class AttachProductVrDto {
  @IsInt() @Min(0)
  expectedProductVersion: number;
  @IsUrl({ require_tld: false })
  panoramaUrl!: string;

  @IsOptional()
  @IsString()
  type?: string;
}
