-- READ ONLY. Run with psql only after separate approval for the target database.
-- Do not pass credentials on the command line; use an approved secret provider.
\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_user AS database_user,
  current_setting('server_version') AS postgres_version,
  inet_server_addr()::text AS server_address,
  inet_server_port() AS server_port,
  pg_is_in_recovery() AS is_replica,
  to_regclass('public."_prisma_migrations"') AS prisma_migrations_table,
  to_regclass('public."Product"') AS product_table,
  to_regclass('public."ProductOptionGroup"') AS legacy_group_table,
  to_regclass('public."ProductOption"') AS legacy_option_table,
  to_regclass('public."ProductConfigurationDependency"') AS dependency_table;

SELECT (to_regclass('public."_prisma_migrations"') IS NOT NULL)::text AS has_history \gset

\if :has_history
  SELECT
    "migration_name",
    "checksum",
    "started_at",
    "finished_at",
    "rolled_back_at",
    "applied_steps_count",
    left(COALESCE("logs", ''), 500) AS logs_preview
  FROM "_prisma_migrations"
  ORDER BY "started_at", "migration_name";

  SELECT
    count(*) FILTER (WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL) AS unfinished,
    count(*) FILTER (WHERE "rolled_back_at" IS NOT NULL) AS rolled_back,
    count(*) AS total_history_rows
  FROM "_prisma_migrations";
\else
  \echo '_prisma_migrations is absent; do not run migrate deploy until an explicit baseline plan is approved.'
\endif

SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('Product', 'Order', 'OrderItem', 'ProductOptionGroup', 'ProductOption')
ORDER BY table_name, ordinal_position;

SELECT
  c.conrelid::regclass::text AS table_name,
  c.conname AS constraint_name,
  c.contype AS constraint_type,
  c.convalidated,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.connamespace = 'public'::regnamespace
  AND c.conrelid IN (
    'public."Product"'::regclass,
    'public."Order"'::regclass,
    'public."OrderItem"'::regclass,
    'public."ProductOptionGroup"'::regclass,
    'public."ProductOption"'::regclass
  )
ORDER BY table_name, constraint_name;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('Product', 'Order', 'OrderItem', 'ProductOptionGroup', 'ProductOption')
ORDER BY tablename, indexname;

SELECT
  (SELECT count(*) FROM "Product") AS products,
  (SELECT count(*) FROM "Product" WHERE "deletedAt" IS NULL) AS live_products,
  (SELECT count(*) FROM "ProductOptionGroup") AS legacy_groups,
  (SELECT count(*) FROM "ProductOption") AS legacy_options,
  (SELECT count(DISTINCT "productId") FROM "ProductOptionGroup") AS products_with_legacy_groups;

COMMIT;
