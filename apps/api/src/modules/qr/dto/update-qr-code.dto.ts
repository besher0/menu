import { IsOptional, IsString } from "class-validator";

export class UpdateQrCodeDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  targetUrl?: string;

  @IsOptional()
  @IsString()
  branchId?: string | null;
}
