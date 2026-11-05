-- Stage 6D.3C1 public-menu concurrency E2E, disposable Neon PG18.6 ONLY.
-- Creates a dedicated marked schema; does not alter any public tables.
BEGIN;
DO $public_menu_race_schema$
DECLARE
  marker CONSTANT text := 'ordersawa:public-menu-race:e2e-disposable:2026-11-05';
  existing text;
BEGIN
  IF current_database() <> 'neondb'
     OR current_user <> 'neondb_owner'
     OR current_setting('server_version_num')::int <> 180006
     OR current_schema() <> 'public' THEN
    RAISE EXCEPTION 'Refusing public menu race E2E schema setup outside approved disposable Neon database';
  END IF;

  IF to_regnamespace('ordersawa_public_menu_race_e2e') IS NULL THEN
    EXECUTE 'CREATE SCHEMA ordersawa_public_menu_race_e2e AUTHORIZATION neondb_owner';
    EXECUTE format('COMMENT ON SCHEMA ordersawa_public_menu_race_e2e IS %L', marker);
  ELSE
    SELECT obj_description('ordersawa_public_menu_race_e2e'::regnamespace, 'pg_namespace')
      INTO existing;
    IF existing IS DISTINCT FROM marker THEN
      RAISE EXCEPTION 'Refusing to reuse an unmarked public menu race E2E schema';
    END IF;
  END IF;
END;
$public_menu_race_schema$;
COMMIT;
