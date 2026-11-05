-- Dedicated, one-use migration replay schema on the PINNED disposable Neon PG18.6 database.
-- Deliberately refuses an existing schema. Never drops, truncates or modifies public tables.
BEGIN;
DO $migration_replay_bootstrap$
BEGIN
  IF current_database() <> 'neondb'
    OR current_user <> 'neondb_owner'
    OR current_setting('server_version_num')::int <> 180006
    OR current_schema() <> 'public'
    OR to_regnamespace('ordersawa_migration_replay_e2e') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing initial replay bootstrap: unexpected disposable Neon identity or nonempty/existing replay schema';
  END IF;
  EXECUTE 'CREATE SCHEMA ordersawa_migration_replay_e2e AUTHORIZATION neondb_owner';
  EXECUTE 'COMMENT ON SCHEMA ordersawa_migration_replay_e2e IS ''ordersawa:migration-replay:e2e-disposable:2026-11-05''';
END;
$migration_replay_bootstrap$;
COMMIT;
