import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { MediaController } from "./media.controller";
import { MediaStorageService } from "./media-storage.service";
import { MediaService } from "./media.service";
import { ProductLibraryService } from "./product-library.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [MediaController],
  providers: [MediaService, MediaStorageService, ProductLibraryService],
  exports: [MediaService, MediaStorageService, ProductLibraryService]
})
export class MediaModule {}
