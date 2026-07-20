import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { QrController } from "./qr.controller";
import { QrPublicController } from "./qr-public.controller";
import { QrService } from "./qr.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [QrController, QrPublicController],
  providers: [QrService]
})
export class QrModule {}
