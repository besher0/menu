-- Read-only post-deploy validation. Fail closed if Prisma routed elsewhere.
DO $migration_replay_verify$
DECLARE
  search_schemas text[];
  table_total int;
  enum_total int;
  applied_total int;
  incomplete_total int;
BEGIN
  SELECT current_schemas(false)::text[] INTO search_schemas;
  IF current_database() <> 'neondb'
     OR current_user <> 'neondb_owner'
     OR current_setting('server_version_num')::int <> 180006
     OR current_schema() <> 'ordersawa_migration_replay_e2e'
     OR search_schemas[1] <> 'ordersawa_migration_replay_e2e'
     OR obj_description('ordersawa_migration_replay_e2e'::regnamespace, 'pg_namespace')
       IS DISTINCT FROM 'ordersawa:migration-replay:e2e-disposable:2026-11-05'
     OR to_regclass('ordersawa_migration_replay_e2e."_prisma_migrations"') IS NULL THEN
    RAISE EXCEPTION 'Migration replay verification failed: unexpected schema/ledger identity';
  END IF;

  SELECT count(*)::int INTO table_total FROM pg_tables WHERE schemaname = 'ordersawa_migration_replay_e2e' AND tablename <> '_prisma_migrations';
  SELECT count(*)::int INTO enum_total FROM pg_type WHERE typnamespace = 'ordersawa_migration_replay_e2e'::regnamespace AND typtype = 'e';
  SELECT count(*)::int, count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)::int
    INTO applied_total, incomplete_total
    FROM ordersawa_migration_replay_e2e."_prisma_migrations";
  IF table_total <> 34 OR enum_total <> 15 OR applied_total <> 9 OR incomplete_total <> 0 THEN
    RAISE EXCEPTION 'Migration replay verification failed: tables %, enums %, ledger %, incomplete %',
      table_total, enum_total, applied_total, incomplete_total;
  END IF;
END;
$migration_replay_verify$;
