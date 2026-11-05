-- Product Configuration Stage 3 — disposable Neon PostgreSQL 18.6 setup.
-- Must be run ONLY after the accompanying PowerShell endpoint check.
-- No production migration, no table deletion, no public-schema changes.
BEGIN;
DO $ordersawa_product_config_setup$
DECLARE
  expected_marker constant text := 'ordersawa:product-configuration:e2e-disposable:2026-11-05';
  present_marker text;
BEGIN
  IF current_database() <> 'neondb'
    OR current_user <> 'neondb_owner'
    OR current_setting('server_version_num')::int <> 180006
    OR current_schema() <> 'public' THEN
    RAISE EXCEPTION 'Refusing product config test setup outside the reviewed Neon PG18 public database';
  END IF;

  IF to_regnamespace('ordersawa_product_config_e2e') IS NULL THEN
    EXECUTE 'CREATE SCHEMA ordersawa_product_config_e2e AUTHORIZATION neondb_owner';
    EXECUTE format('COMMENT ON SCHEMA ordersawa_product_config_e2e IS %L', expected_marker);
  ELSE
    SELECT obj_description('ordersawa_product_config_e2e'::regnamespace, 'pg_namespace')
      INTO present_marker;
    IF present_marker IS DISTINCT FROM expected_marker THEN
      RAISE EXCEPTION 'Refusing to reuse an existing, unmarked product config test schema';
    END IF;
  END IF;
END;
$ordersawa_product_config_setup$;
COMMIT;
