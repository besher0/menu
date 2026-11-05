-- Read-only target validation BEFORE prisma migrate deploy.
DO $migration_replay_preflight$
DECLARE
  search_schemas text[];
BEGIN
  SELECT current_schemas(false)::text[] INTO search_schemas;
  IF current_database() <> 'neondb'
     OR current_user <> 'neondb_owner'
     OR current_setting('server_version_num')::int <> 180006
     OR current_schema() <> 'ordersawa_migration_replay_e2e'
     OR search_schemas[1] <> 'ordersawa_migration_replay_e2e'
     OR obj_description('ordersawa_migration_replay_e2e'::regnamespace, 'pg_namespace')
       IS DISTINCT FROM 'ordersawa:migration-replay:e2e-disposable:2026-11-05'
     OR EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ordersawa_migration_replay_e2e')
     OR EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'ordersawa_migration_replay_e2e'::regnamespace AND typtype = 'e') THEN
    RAISE EXCEPTION 'Refusing migration replay: identity, search_path, schema marker or emptiness check failed';
  END IF;
END;
$migration_replay_preflight$;
