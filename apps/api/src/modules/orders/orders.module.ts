import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { NetworkOrderLoopbackGuard, NetworkOrdersController } from "./network-orders.controller";
import { NetworkOrdersService } from "./network-orders.service";

@Module({
  controllers: [OrdersController, NetworkOrdersController],
  providers: [OrdersService, NetworkOrdersService, NetworkOrderLoopbackGuard]
})
export class OrdersModule {}
