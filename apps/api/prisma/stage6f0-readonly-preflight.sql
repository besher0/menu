-- Stage 6F.0: review-only PostgreSQL schema/history inventory.
-- NEVER run against an existing/Production database without separate explicit approval.
-- Use an approved read-only role/secret provider; do not put connection details in Git.
-- No customer, order, product, phone, credential, or migration-log rows are selected.
\set ON_ERROR_STOP on
\pset pager off

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';

-- Database identity and engine version; no host address or credential value.
SELECT current_database() AS database_name,
       current_setting('server_version') AS postgresql_version,
       current_setting('server_version_num') AS postgresql_version_num,
       pg_is_in_recovery() AS is_replica;

-- Table presence. This is metadata only, not a table-data scan.
SELECT required.table_name,
       to_regclass(format('public.%I', required.table_name)) IS NOT NULL AS exists_in_public
FROM (VALUES
  ('Restaurant'), ('Branch'), ('Category'), ('Product'),
  ('ProductOptionGroup'), ('ProductOption'), ('ProductConfigurationDependency'),
  ('SubscriptionPlan'), ('RestaurantSubscription'), ('SubscriptionFeature'),
  ('RestaurantThemeSettings'), ('Order'), ('OrderItem'), ('AnalyticsEvent'),
  ('_prisma_migrations')
) AS required(table_name)
ORDER BY required.table_name;

-- Exact formatted type (including decimal precision/scale), nullability and
-- default presence. pg_catalog avoids information_schema privilege filtering.
SELECT t.relname AS table_name, a.attnum AS ordinal_position,
       a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null, a.atthasdef AS has_default,
       a.attidentity AS identity_kind, a.attgenerated AS generated_kind
FROM pg_attribute AS a
JOIN pg_class AS t ON t.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
  AND t.relkind IN ('r', 'p') AND t.relname IN (
    'Restaurant', 'Branch', 'Category', 'Product', 'ProductOptionGroup',
    'ProductOption', 'ProductConfigurationDependency', 'SubscriptionPlan',
    'RestaurantSubscription', 'SubscriptionFeature', 'RestaurantThemeSettings',
    'Order', 'OrderItem', 'AnalyticsEvent'
  )
ORDER BY t.relname, a.attnum;

-- Constraints: definition is schema text, not row data. convalidated matters for Stage 2C.
SELECT t.relname AS table_name, c.conname AS constraint_name,
       c.contype AS constraint_type, c.convalidated AS validated,
       c.condeferrable AS deferrable, c.condeferred AS initially_deferred,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
JOIN pg_class AS t ON t.oid = c.conrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN ('Product', 'ProductConfigurationDependency', 'Order', 'OrderItem')
ORDER BY t.relname, c.conname;

-- Index uniqueness, validity and key definitions for the affected tables.
SELECT t.relname AS table_name, i.relname AS index_name,
       x.indisunique AS is_unique, x.indisvalid AS is_valid,
       pg_get_indexdef(i.oid) AS definition
FROM pg_index AS x
JOIN pg_class AS t ON t.oid = x.indrelid
JOIN pg_class AS i ON i.oid = x.indexrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN ('Product', 'ProductConfigurationDependency', 'Order', 'OrderItem')
ORDER BY t.relname, i.relname;

-- Required enum labels. No table rows are read.
SELECT ty.typname AS enum_name, e.enumsortorder, e.enumlabel
FROM pg_type AS ty
JOIN pg_namespace AS n ON n.oid = ty.typnamespace
JOIN pg_enum AS e ON e.enumtypid = ty.oid
WHERE n.nspname = 'public'
  AND ty.typname IN ('LinkedProductMode', 'OrderStatus')
ORDER BY ty.typname, e.enumsortorder;

-- Trigger identity/status only. SQL function bodies are deliberately not exported.
SELECT t.relname AS table_name, g.tgname AS trigger_name,
       g.tgenabled AS enabled_mode, g.tgdeferrable AS deferrable,
       g.tginitdeferred AS initially_deferred, p.proname AS function_name
FROM pg_trigger AS g
JOIN pg_class AS t ON t.oid = g.tgrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
JOIN pg_proc AS p ON p.oid = g.tgfoid
WHERE n.nspname = 'public' AND NOT g.tgisinternal
  AND t.relname IN ('Product', 'ProductConfigurationDependency', 'Order', 'OrderItem')
ORDER BY t.relname, g.tgname;

-- Prisma history is queried only if present. Never expose its logs column.
SELECT (to_regclass('public."_prisma_migrations"') IS NOT NULL)::text AS has_history \gset
\if :has_history
  SELECT migration_name, checksum, started_at, finished_at, rolled_back_at,
         applied_steps_count
  FROM public."_prisma_migrations"
  ORDER BY started_at, migration_name;
\else
  \echo '_prisma_migrations absent: stop; do not run migrate deploy or invent a baseline.'
\endif

COMMIT;
