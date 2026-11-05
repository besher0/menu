-- Stage 6E.2 WhatsApp Checkout — disposable Neon PG18 dedicated-schema bootstrap.
-- This creates only a new, marked schema. It NEVER changes public tables.
BEGIN;
DO $whatsapp_e2e_bootstrap$
DECLARE
  expected_marker constant text := 'ordersawa:whatsapp-checkout:e2e-disposable:2026-11-05';
  existing_marker text;
BEGIN
  IF current_database() <> 'neondb'
    OR current_user <> 'neondb_owner'
    OR current_setting('server_version_num')::int <> 180006
    OR current_schema() <> 'public' THEN
    RAISE EXCEPTION 'Refusing WhatsApp fixture bootstrap outside exact disposable Neon PG18 public database';
  END IF;

  IF to_regnamespace('ordersawa_whatsapp_checkout_e2e') IS NULL THEN
    CREATE SCHEMA ordersawa_whatsapp_checkout_e2e AUTHORIZATION neondb_owner;
    COMMENT ON SCHEMA ordersawa_whatsapp_checkout_e2e IS
      'ordersawa:whatsapp-checkout:e2e-disposable:2026-11-05';
  ELSE
    SELECT obj_description('ordersawa_whatsapp_checkout_e2e'::regnamespace, 'pg_namespace')
      INTO existing_marker;
    IF existing_marker IS DISTINCT FROM expected_marker THEN
      RAISE EXCEPTION 'Refusing to reuse an unmarked WhatsApp test schema';
    END IF;
  END IF;
END;
$whatsapp_e2e_bootstrap$;
COMMIT;
