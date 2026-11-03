import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { NetworkOrdersService } from "./network-orders.service";

function conflict(code: string) {
  return new Prisma.PrismaClientKnownRequestError("concurrent catalog update", {
    code,
    clientVersion: "test"
  });
}

describe("network order serializable retries", () => {
  it("retries a serialization conflict and returns the successful transaction result", async () => {
    const transaction = vi.fn()
      .mockRejectedValueOnce(conflict("P2034"))
      .mockResolvedValueOnce("ok");
    const service = new NetworkOrdersService({ $transaction: transaction } as never);
    const result = await service["runSerializable"](async () => "ok");
    expect(result).toBe("ok");
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[0][1]).toMatchObject({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  });

  it("never retries non-serialization database errors", async () => {
    const failure = conflict("P2002");
    const transaction = vi.fn().mockRejectedValue(failure);
    const service = new NetworkOrdersService({ $transaction: transaction } as never);
    await expect(service["runSerializable"](async () => "unused")).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("stops after three serialization conflicts", async () => {
    const transaction = vi.fn().mockRejectedValue(conflict("P2034"));
    const service = new NetworkOrdersService({ $transaction: transaction } as never);
    await expect(service["runSerializable"](async () => "unused")).rejects.toMatchObject({ code: "P2034" });
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
