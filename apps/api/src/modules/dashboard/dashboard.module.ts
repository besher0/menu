import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [DashboardController],
  providers: [DashboardService]
})
export class DashboardModule {}
