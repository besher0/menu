import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from "class-validator";

export class PublicOrderItemDto {
  @IsString()
  productSlug: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class CreateWhatsappOrderDto {
  @IsOptional()
  @IsString()
  branchSlug?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  orderNote?: string;

  @IsOptional()
  @IsIn(["pickup", "delivery"])
  fulfillmentType?: "pickup" | "delivery";

  @IsOptional()
  @IsString()
  deliveryArea?: string;

  @IsOptional()
  @IsString()
  deliveryNear?: string;

  @IsOptional()
  @IsString()
  deliveryBeside?: string;

  @IsOptional()
  @IsString()
  pickupTime?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PublicOrderItemDto)
  items: PublicOrderItemDto[];
}
