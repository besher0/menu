import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { PublicMenuController } from "./public-menu.controller";
import { PublicMenuService } from "./public-menu.service";
import { PublicWhatsappCheckoutService } from "./public-whatsapp-checkout.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [PublicMenuController],
  providers: [PublicMenuService, PublicWhatsappCheckoutService]
})
export class PublicMenuModule {}
