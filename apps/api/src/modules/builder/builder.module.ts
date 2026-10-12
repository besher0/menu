import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { BuilderController } from "./builder.controller";
import { BuilderService } from "./builder.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [BuilderController],
  providers: [BuilderService]
})
export class BuilderModule {}
