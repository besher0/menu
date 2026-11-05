import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { assertNetworkOrderCompletenessGuard } from "./network-order-db-guard";

const OLD = {
  trigger: "45aee35f2ba9ffa3dad765de5bb22edabd4d334559483726a9ec3fac72ef5a45",
  guard: "7a3e6ffd54bfd096a64e5b3c530facdd366d649354d4296d7c1b03df170e8936",
  money: "0a84da4aa22b4e0c6079d4bcb2fd5a7c907295a30fa3efe1128b95dc0a2780bf"
};
const NEON = {
  trigger: OLD.trigger,
  guard: "75cbdd5a312e7c78e36a0e6bc6c43d4562ee9eaf4a2e3473f69691912395eef0",
  money: "d371ec173eac71f9b792c9b21b55f91a1970111af940f32b36e26d3b03108d6e"
};
const keys = [
  "NODE_ENV", "GITHUB_ACTIONS", "ENABLE_DISPOSABLE_NETWORK_ORDERS",
  "NEON_DISPOSABLE_NETWORK_TESTS", "NETWORK_ORDER_TEST_DATABASE_URL"
] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function state(kind: "local" | "neon") {
  const remote = kind === "neon";
  const hashes = remote ? NEON : OLD;
  return {
    databaseName: remote ? "neondb" : "ordersawa_stage3_stage6c_guard_test",
    databaseUser: remote ? "neondb_owner" : "postgres",
    address: remote ? "10.0.0.5" : "127.0.0.1",
    port: remote ? 5432 : 55440,
    serverVersion: remote ? 180006 : 160000,
    triggerCount: 1, triggerHash: hashes.trigger, triggerType: 21,
    deferrable: true, initiallyDeferred: true, triggerEnabled: "O",
    sourceColumnMatches: true, guardFunctionHash: hashes.guard, guardFunctionArgs: 0,
    guardFunctionConfig: ["search_path=pg_catalog, public"],
    moneyFunctionHash: hashes.money,
    moneyFunctionConfig: ["search_path=pg_catalog"],
    moneyFunctionImmutable: true, moneyFunctionSignature: "value jsonb",
    stage6cTriggerCount: 6
  };
}
function transaction(row: ReturnType<typeof state>) {
  return { $queryRaw: async () => [row] } as unknown as Prisma.TransactionClient;
}
function optIn() {
  process.env.NODE_ENV = "test";
  process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS = "1";
  process.env.NEON_DISPOSABLE_NETWORK_TESTS = "1";
  delete process.env.GITHUB_ACTIONS;
  process.env.NETWORK_ORDER_TEST_DATABASE_URL =
    "postgresql://neondb_owner:synthetic-test-value@ep-tiny-frost-b90v7e8c-pooler.c-7.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
}

describe("Network Order DB guard environment isolation", () => {
  it("preserves the original verified PostgreSQL 16 loopback fixture", async () => {
    await expect(assertNetworkOrderCompletenessGuard(transaction(state("local")))).resolves.toBeUndefined();
  });
  it("rejects Neon unless explicitly opted into test mode", async () => {
    delete process.env.NEON_DISPOSABLE_NETWORK_TESTS;
    await expect(assertNetworkOrderCompletenessGuard(transaction(state("neon"))))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("accepts only the exact opted-in Neon 18.6 fixture", async () => {
    optIn();
    await expect(assertNetworkOrderCompletenessGuard(transaction(state("neon")))).resolves.toBeUndefined();
  });
  it("rejects a different Neon host even with valid function fingerprints", async () => {
    optIn();
    process.env.NETWORK_ORDER_TEST_DATABASE_URL =
      process.env.NETWORK_ORDER_TEST_DATABASE_URL!.replace("ep-tiny-frost-b90v7e8c-pooler", "ep-unrelated-pooler");
    await expect(assertNetworkOrderCompletenessGuard(transaction(state("neon"))))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("rejects altered database-side guard code", async () => {
    optIn();
    const altered = { ...state("neon"), guardFunctionHash: OLD.guard };
    await expect(assertNetworkOrderCompletenessGuard(transaction(altered)))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("rejects Neon when NODE_ENV is production", async () => {
    optIn();
    process.env.NODE_ENV = "production";
    await expect(assertNetworkOrderCompletenessGuard(transaction(state("neon"))))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
