-- Stage 6F.4 REVIEW CANDIDATE / disposable PostgreSQL 18.6 ONLY.
-- This psql orchestration is deliberately locked to one synthetic database.
-- It is NOT a Production migration, not a Prisma history resolution, and does
-- not authorize running official SQL against an existing database.
\set ON_ERROR_STOP on

DO $$
DECLARE
  expected_count integer;
BEGIN
  IF current_database() <> 'ordersawa_stage6f4_candidate'
     OR host(inet_server_addr()) <> '127.0.0.1'
     OR current_setting('server_version_num')::integer < 180000 THEN
    RAISE EXCEPTION 'STOP: Stage 6F.4 candidate accepts only the named loopback PG18 disposable database';
  END IF;
  IF to_regclass('public."ProductConfigurationDependency"') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='Product'
                  AND column_name IN ('configurationTree','configurationVersion'))
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='Order'
                  AND column_name IN ('idempotencyKey','requestHash','acceptanceTokenHash','networkSnapshotSealedAt')) THEN
    RAISE EXCEPTION 'STOP: baseline is not the expected pre-Stage-2C/pre-Stage-6C schema';
  END IF;
  IF (SELECT format_type(a.atttypid,a.atttypmod)
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      WHERE c.relname='Product' AND a.attname='basePrice' AND a.attnum>0) <> 'numeric(10,2)' THEN
    RAISE EXCEPTION 'STOP: basePrice typmod differs from the synthetic baseline; investigate before DDL';
  END IF;
  IF to_regclass('public."_prisma_migrations"') IS NULL THEN
    RAISE EXCEPTION 'STOP: migration history table missing';
  END IF;
  SELECT count(*) INTO expected_count FROM "_prisma_migrations";
  IF expected_count <> 5 OR EXISTS (
    WITH expected(name, hash) AS (VALUES
      ('20260719000000_add_category_visual_settings','A5BBCB330F71578EE49750E0C15D79DD6088500C1248359EEC432BC6713FBC1B'),
      ('20260721000000_add_product_mood_key','4A085CEE7B45F7E46F9BC9F24E903D1F7BBE46EC412BEEE9DD2654B7A3C61EE1'),
      ('20260721001000_add_category_icon_dimensions','A27E49CB39595C5D98CB6EEAF4E2D79D6A0AD921A665598E78B5BEEBBA2F4565'),
      ('20260807000000_add_product_libraries','579D7AEB52CFF91C99756482BD44AB1749B099EF8C15624D3FBE146F74BA18D9'),
      ('20260815000000_global_product_libraries','4544E53CE71008FE157B97B4D1D7883E0C532BAAD7C40CDDE2B4514FCC15C92C'))
    SELECT 1 FROM expected e LEFT JOIN "_prisma_migrations" m ON m.migration_name=e.name
    GROUP BY e.name,e.hash
    HAVING count(m.id) <> 1 OR bool_or(upper(m.checksum) <> e.hash
      OR m.finished_at IS NULL OR m.rolled_back_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'STOP: synthetic migration history does not match the five Git SQL files';
  END IF;
  IF EXISTS (SELECT 1 FROM "Product" WHERE "basePrice" < 0
      OR "basePrice" <> round("basePrice",6)
      OR abs(round("basePrice",6)) >= 1000000000000000000::numeric
      OR ("currency" IN ('SYP','ل.س') AND "basePrice" <> trunc("basePrice")))
    OR EXISTS (SELECT 1 FROM "Order" WHERE "totalAmount" < 0
      OR "totalAmount" <> round("totalAmount",6)
      OR abs(round("totalAmount",6)) >= 1000000000000000000::numeric
      OR ("currency" IN ('SYP','ل.س') AND "totalAmount" <> trunc("totalAmount")))
    OR EXISTS (SELECT 1 FROM "OrderItem" WHERE "unitPrice" <> round("unitPrice",6)
      OR "totalPrice" <> round("totalPrice",6)
      OR abs(round("unitPrice",6)) >= 1000000000000000000::numeric
      OR abs(round("totalPrice",6)) >= 1000000000000000000::numeric)
    OR EXISTS (SELECT 1 FROM "ProductOption" o
      JOIN "ProductOptionGroup" g ON g.id=o."groupId"
      JOIN "Product" p ON p.id=g."productId"
      WHERE p."currency" IN ('SYP','ل.س')
        AND o."priceDelta" <> trunc(o."priceDelta")) THEN
    RAISE EXCEPTION 'STOP: synthetic historical prices require review; no implicit rounding/repair';
  END IF;
END $$;

-- Official Git migrations are included unchanged; no db push/migrate deploy.
\ir ../apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql

-- Stage 6C has no explicit transaction in its source file. The disposable
-- candidate wraps it atomically; this does not alter the official file.
BEGIN;
\ir ../apps/api/prisma/migrations/20261013000000_network_order_test_snapshot/migration.sql
COMMIT;

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      WHERE c.relname='Product' AND k.contype='c' AND k.convalidated
        AND k.conname LIKE 'Product_%_check') <> 5
     OR to_regclass('public."ProductConfigurationDependency"') IS NULL
     OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
         AND table_name='Order' AND column_name IN
           ('idempotencyKey','requestHash','acceptanceTokenHash','networkSnapshotSealedAt')) <> 4
     OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
         WHERE c.relname IN ('Order','OrderItem') AND NOT t.tgisinternal) <> 6 THEN
    RAISE EXCEPTION 'STOP: post-migration schema checks failed';
  END IF;
END $$;

SELECT 'STAGE6F4_DISPOSABLE_CANDIDATE_PASS' AS result;
