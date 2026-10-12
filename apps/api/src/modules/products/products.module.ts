import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { MediaModule } from "../media/media.module";
import { ProductsController } from "./products.controller";
import { ProductsImportService } from "./products-import.service";
import { ProductsService } from "./products.service";

@Module({
  imports: [FeatureFlagsModule, MediaModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsImportService],
  exports: [ProductsService]
})
export class ProductsModule {}
