import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [MediaController],
  providers: [MediaService]
})
export class MediaModule {}
