import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

// Fingerprints of the PostgreSQL 16 definitions in the disposable-only Stage 6D.3C3E candidate.
// A trigger name alone is not evidence that the required commit guard is installed.
const EXPECTED_PG16 = {
  trigger: "45aee35f2ba9ffa3dad765de5bb22edabd4d334559483726a9ec3fac72ef5a45",
  guard: "7a3e6ffd54bfd096a64e5b3c530facdd366d649354d4296d7c1b03df170e8936",
  money: "0a84da4aa22b4e0c6079d4bcb2fd5a7c907295a30fa3efe1128b95dc0a2780bf"
} as const;

// Independently observed on the isolated Neon PostgreSQL 18.6 Stage 6D fixture.
// These fingerprints are NOT interchangeable with the PostgreSQL 16 baseline.
const EXPECTED_NEON_PG18 = {
  trigger: "45aee35f2ba9ffa3dad765de5bb22edabd4d334559483726a9ec3fac72ef5a45",
  guard: "75cbdd5a312e7c78e36a0e6bc6c43d4562ee9eaf4a2e3473f69691912395eef0",
  money: "d371ec173eac71f9b792c9b21b55f91a1970111af940f32b36e26d3b03108d6e"
} as const;

// Pin both exact endpoints for the same disposable Neon test instance.
// The direct endpoint has no "-pooler" component; never accept a hostname wildcard.
const DISPOSABLE_NEON_TEST_HOSTS = new Set([
  "ep-tiny-frost-b90v7e8c.c-7.eu-central-1.aws.neon.tech",
  "ep-tiny-frost-b90v7e8c-pooler.c-7.eu-central-1.aws.neon.tech"
]);

/** Match only the reviewed disposable Neon connection; never wildcard all Neon endpoints. */
export function isDisposableNeonNetworkTestUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "postgresql:" || url.protocol === "postgres:")
      && DISPOSABLE_NEON_TEST_HOSTS.has(url.hostname)
      && url.pathname === "/neondb" && url.username === "neondb_owner"
      && url.password.length > 0 && (url.port === "" || url.port === "5432")
      && url.searchParams.get("sslmode") === "require"
      && url.searchParams.get("channel_binding") === "require";
  } catch {
    return false;
  }
}

/** Explicitly opt in only for a local Vitest run against the pinned disposable Neon DB. */
export function isDisposableNeonNetworkTestOptedIn(): boolean {
  if (process.env.NODE_ENV !== "test" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1"
    || process.env.NEON_DISPOSABLE_NETWORK_TESTS !== "1" || process.env.GITHUB_ACTIONS === "true") return false;
  return isDisposableNeonNetworkTestUrl(process.env.NETWORK_ORDER_TEST_DATABASE_URL);
}

export const NETWORK_ORDER_COMPLETENESS_CONSTRAINT = '"Order_network_test_completeness_guard"';

type GuardState = {
  databaseName: string;
  databaseUser: string;
  address: string | null;
  port: number | null;
  serverVersion: number;
  triggerCount: number;
  triggerHash: string | null;
  triggerType: number | null;
  deferrable: boolean | null;
  initiallyDeferred: boolean | null;
  triggerEnabled: string | null;
  sourceColumnMatches: boolean | null;
  guardFunctionHash: string | null;
  guardFunctionConfig: string[] | null;
  guardFunctionArgs: number | null;
  moneyFunctionHash: string | null;
  moneyFunctionConfig: string[] | null;
  moneyFunctionImmutable: boolean | null;
  moneyFunctionSignature: string | null;
  stage6cTriggerCount: number;
};

/** Fail closed before any NETWORK_TEST Order INSERT; this does not install or migrate a guard. */
export async function assertNetworkOrderCompletenessGuard(transaction: Prisma.TransactionClient): Promise<void> {
  let state: GuardState;
  try {
    const rows = await transaction.$queryRaw<GuardState[]>`
      SELECT current_database() AS "databaseName", current_user AS "databaseUser", host(inet_server_addr()) AS address,
        inet_server_port() AS port, current_setting('server_version_num')::int AS "serverVersion",
        count(t.oid)::int AS "triggerCount",
        max(encode(sha256(convert_to(pg_get_triggerdef(t.oid), 'UTF8')), 'hex')) AS "triggerHash",
        max(t.tgtype::int) AS "triggerType", bool_and(t.tgdeferrable) AS deferrable,
        bool_and(t.tginitdeferred) AS "initiallyDeferred", max(t.tgenabled::text) AS "triggerEnabled",
        bool_and(t.tgattr::text = a.attnum::text) AS "sourceColumnMatches",
        max(encode(sha256(convert_to(g.prosrc, 'UTF8')), 'hex')) AS "guardFunctionHash",
        max(g.proconfig) AS "guardFunctionConfig", max(g.pronargs::int) AS "guardFunctionArgs",
        (SELECT encode(sha256(convert_to(m.prosrc, 'UTF8')), 'hex') FROM pg_proc m
          WHERE m.pronamespace = 'public'::regnamespace AND m.proname = 'network_order_guard_money'
            AND pg_get_function_identity_arguments(m.oid) = 'value jsonb') AS "moneyFunctionHash",
        (SELECT m.proconfig FROM pg_proc m
          WHERE m.pronamespace = 'public'::regnamespace AND m.proname = 'network_order_guard_money'
            AND pg_get_function_identity_arguments(m.oid) = 'value jsonb') AS "moneyFunctionConfig",
        (SELECT m.provolatile = 'i' AND m.proparallel = 's' FROM pg_proc m
          WHERE m.pronamespace = 'public'::regnamespace AND m.proname = 'network_order_guard_money'
            AND pg_get_function_identity_arguments(m.oid) = 'value jsonb') AS "moneyFunctionImmutable",
        (SELECT pg_get_function_identity_arguments(m.oid) FROM pg_proc m
          WHERE m.pronamespace = 'public'::regnamespace AND m.proname = 'network_order_guard_money'
            AND pg_get_function_identity_arguments(m.oid) = 'value jsonb') AS "moneyFunctionSignature",
        (SELECT count(*)::int FROM pg_trigger old
          WHERE old.tgrelid IN ('public."Order"'::regclass, 'public."OrderItem"'::regclass)
            AND old.tgenabled = 'O' AND old.tgname IN (
              'Order_network_snapshot_immutable', 'Order_network_snapshot_no_delete',
              'Order_network_snapshot_seal_required', 'OrderItem_network_snapshot_immutable',
              'OrderItem_network_snapshot_no_late_insert', 'OrderItem_network_snapshot_no_delete')) AS "stage6cTriggerCount"
      FROM pg_trigger t
      LEFT JOIN pg_proc g ON g.oid = t.tgfoid AND g.pronamespace = 'public'::regnamespace
        AND g.proname = 'require_complete_network_test_order'
      LEFT JOIN pg_attribute a ON a.attrelid = 'public."Order"'::regclass AND a.attname = 'source'
      WHERE t.tgrelid = 'public."Order"'::regclass
        AND t.tgname = 'Order_network_test_completeness_guard'
    `;
    state = rows[0];
  } catch {
    throw new ServiceUnavailableException({ error: "NETWORK_ORDER_DB_GUARD_UNAVAILABLE", message: "Test order storage guard could not be verified." });
  }
  const expectedLocal = state && state.databaseName.startsWith("ordersawa_stage3_stage6c_")
    && state.address === "127.0.0.1" && state.port === 55440
    && state.serverVersion >= 160000 && state.serverVersion < 170000;
  // The GitHub Actions PostgreSQL service exposes host port 55440, but
  // Postgres sees its actual container listener on port 5432. Require all
  // CI signals, its exact disposable DB name/user, PG16 and loopback URL.
  const ciUrlRaw = process.env.NETWORK_ORDER_TEST_DATABASE_URL;
  let trustedCiUrl = false;
  if (ciUrlRaw) {
    try {
      const ciUrl = new URL(ciUrlRaw);
      trustedCiUrl = ciUrl.protocol === "postgresql:"
        && ciUrl.hostname === "127.0.0.1" && ciUrl.port === "55440"
        && ciUrl.pathname === "/ordersawa_stage3_stage6c_ci"
        && ciUrl.username === "test";
    } catch { /* Fail closed on malformed URLs. */ }
  }
  const expectedCi = state
    && process.env.GITHUB_ACTIONS === "true" && process.env.CI === "true"
    && process.env.NODE_ENV === "test" && process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS === "1"
    && trustedCiUrl && state.databaseName === "ordersawa_stage3_stage6c_ci"
    && state.databaseUser === "test" && state.port === 5432
    && state.serverVersion >= 160000 && state.serverVersion < 170000;
  const expectedNeon = state && isDisposableNeonNetworkTestOptedIn()
    && state.databaseName === "neondb" && state.databaseUser === "neondb_owner"
    && state.serverVersion === 180006;
  const expected = expectedLocal || expectedCi ? EXPECTED_PG16 : expectedNeon ? EXPECTED_NEON_PG18 : null;
  if (!state || !expected || state.triggerCount !== 1 || state.triggerHash !== expected.trigger
    || state.triggerType !== 21 || state.deferrable !== true || state.initiallyDeferred !== true
    || state.triggerEnabled !== "O" || state.sourceColumnMatches !== true
    || state.guardFunctionHash !== expected.guard || state.guardFunctionArgs !== 0
    || state.guardFunctionConfig?.join("|") !== "search_path=pg_catalog, public"
    || state.moneyFunctionHash !== expected.money
    || state.moneyFunctionConfig?.join("|") !== "search_path=pg_catalog"
    || state.moneyFunctionImmutable !== true || state.moneyFunctionSignature !== "value jsonb"
    || state.stage6cTriggerCount !== 6) {
    throw new ServiceUnavailableException({ error: "NETWORK_ORDER_DB_GUARD_UNAVAILABLE", message: "The expected test order storage guard is not installed." });
  }
}
