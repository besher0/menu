import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./app.controller";
import { AdminModule } from "./modules/admin/admin.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BuilderModule } from "./modules/builder/builder.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { FeatureFlagsModule } from "./modules/feature-flags/feature-flags.module";
import { MediaModule } from "./modules/media/media.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { ProductsModule } from "./modules/products/products.module";
import { PublicMenuModule } from "./modules/public-menu/public-menu.module";
import { QrModule } from "./modules/qr/qr.module";
import { SyncModule } from "./modules/sync/sync.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "dev-secret",
      signOptions: { expiresIn: "7d" }
    }),
    PrismaModule,
    FeatureFlagsModule,
    AuthModule,
    BuilderModule,
    AdminModule,
    DashboardModule,
    MediaModule,
    ProductsModule,
    PublicMenuModule,
    QrModule,
    SyncModule,
    OrdersModule,
    AnalyticsModule
  ],
  controllers: [AppController]
})
export class AppModule {}
