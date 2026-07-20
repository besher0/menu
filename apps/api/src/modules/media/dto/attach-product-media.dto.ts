import { IsOptional, IsString, IsUrl } from "class-validator";

export class AttachProductImageDto {
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
  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  format?: string;
}

export class AttachProductVrDto {
  @IsUrl({ require_tld: false })
  panoramaUrl!: string;

  @IsOptional()
  @IsString()
  type?: string;
}
