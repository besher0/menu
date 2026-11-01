import { Prisma } from "@prisma/client";

/** All public WhatsApp order writers must take this restaurant row lock before counting. */
export async function reserveDailyWhatsappOrderNumber(tx: Prisma.TransactionClient, restaurantId: string): Promise<string> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Restaurant" WHERE "id" = ${restaurantId} FOR UPDATE
  `;
  if (locked.length !== 1) throw new Error("ORDER_RESTAURANT_UNAVAILABLE");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const count = await tx.order.count({ where: { restaurantId, createdAt: { gte: start, lt: end } } });
  return String(count + 1).padStart(3, "0");
}
