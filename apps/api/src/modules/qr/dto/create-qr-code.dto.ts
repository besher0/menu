import { IsOptional, IsString } from "class-validator";

export class CreateQrCodeDto {
  @IsString()
  label!: string;

  @IsString()
  targetUrl!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
