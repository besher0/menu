import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { PublicMenuController } from "./public-menu.controller";
import { PublicMenuService } from "./public-menu.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [PublicMenuController],
  providers: [PublicMenuService]
})
export class PublicMenuModule {}
