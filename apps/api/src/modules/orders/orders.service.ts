import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OrdersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(restaurantId: string) {
    const orders = await this.prisma.order.findMany({
      where: { restaurantId },
      include: {
        branch: true,
        items: true
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return orders.map((order) => ({
      id: order.id,
      branch: order.branch?.name ?? null,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      status: order.status,
      source: order.source,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        options: item.options,
        note: item.note
      }))
    }));
  }
}
