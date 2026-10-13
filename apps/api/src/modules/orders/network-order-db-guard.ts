import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

// Fingerprints of the PostgreSQL 16 definitions in the disposable-only Stage 6D.3C3E candidate.
// A trigger name alone is not evidence that the required commit guard is installed.
const EXPECTED = {
  trigger: "45aee35f2ba9ffa3dad765de5bb22edabd4d334559483726a9ec3fac72ef5a45",
  guard: "7a3e6ffd54bfd096a64e5b3c530facdd366d649354d4296d7c1b03df170e8936",
  money: "0a84da4aa22b4e0c6079d4bcb2fd5a7c907295a30fa3efe1128b95dc0a2780bf"
} as const;

export const NETWORK_ORDER_COMPLETENESS_CONSTRAINT = '"Order_network_test_completeness_guard"';

type GuardState = {
  databaseName: string;
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
      SELECT current_database() AS "databaseName", host(inet_server_addr()) AS address,
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
  if (!state || !state.databaseName.startsWith("ordersawa_stage3_stage6c_")
    || state.address !== "127.0.0.1" || state.port !== 55440
    || state.serverVersion < 160000 || state.serverVersion >= 170000
    || state.triggerCount !== 1 || state.triggerHash !== EXPECTED.trigger
    || state.triggerType !== 21 || state.deferrable !== true || state.initiallyDeferred !== true
    || state.triggerEnabled !== "O" || state.sourceColumnMatches !== true
    || state.guardFunctionHash !== EXPECTED.guard || state.guardFunctionArgs !== 0
    || state.guardFunctionConfig?.join("|") !== "search_path=pg_catalog, public"
    || state.moneyFunctionHash !== EXPECTED.money
    || state.moneyFunctionConfig?.join("|") !== "search_path=pg_catalog"
    || state.moneyFunctionImmutable !== true || state.moneyFunctionSignature !== "value jsonb"
    || state.stage6cTriggerCount !== 6) {
    throw new ServiceUnavailableException({ error: "NETWORK_ORDER_DB_GUARD_UNAVAILABLE", message: "The expected test order storage guard is not installed." });
  }
}
