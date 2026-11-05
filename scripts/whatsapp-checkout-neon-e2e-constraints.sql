-- Stage 6E.2 WhatsApp Checkout: installation of only the five vetted Product CHECKs.
-- Definitions copied from migration 20261012000000_product_configuration_network.
-- Do not replay the entire migration on an already db-pushed schema.
BEGIN;
DO $whatsapp_e2e_constraints$
DECLARE
  marker text;
  cnt int;
  valid_cnt int;
  product_cnt int;
  correct_names int;
BEGIN
  IF current_database() <> 'neondb'
    OR current_user <> 'neondb_owner'
    OR current_setting('server_version_num')::int <> 180006 THEN
    RAISE EXCEPTION 'Refusing WhatsApp constraints outside disposable Neon PG18 identity';
  END IF;
  SELECT obj_description('ordersawa_whatsapp_checkout_e2e'::regnamespace, 'pg_namespace') INTO marker;
  IF marker IS DISTINCT FROM 'ordersawa:whatsapp-checkout:e2e-disposable:2026-11-05' THEN
    RAISE EXCEPTION 'WhatsApp test schema marker mismatch';
  END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'ordersawa_whatsapp_checkout_e2e') <> 34 THEN
    RAISE EXCEPTION 'WhatsApp test schema not completely initialized';
  END IF;
  SELECT count(*)::int, count(*) FILTER (WHERE convalidated)::int,
    count(*) FILTER (WHERE conname = ANY(ARRAY[
      'Product_configurationVersion_nonnegative_check',
      'Product_basePrice_nonnegative_check',
      'Product_configuration_legacy_state_check',
      'Product_configuration_shape_check',
      'Product_configuration_basePrice_match_check'
    ]))::int
    INTO cnt, valid_cnt, correct_names
    FROM pg_constraint
    WHERE conrelid = 'ordersawa_whatsapp_checkout_e2e."Product"'::regclass
      AND contype = 'c' AND conname LIKE 'Product_%check';

  IF cnt = 0 THEN
    SELECT count(*)::int INTO product_cnt FROM ordersawa_whatsapp_checkout_e2e."Product";
    IF product_cnt <> 0 THEN
      RAISE EXCEPTION 'Refusing to install WhatsApp checks on a populated test Product table';
    END IF;
    EXECUTE $checks$
      ALTER TABLE ordersawa_whatsapp_checkout_e2e."Product"
        ADD CONSTRAINT "Product_configurationVersion_nonnegative_check"
          CHECK ("configurationVersion" >= 0),
        ADD CONSTRAINT "Product_basePrice_nonnegative_check"
          CHECK ("basePrice" IS NULL OR "basePrice" >= 0),
        ADD CONSTRAINT "Product_configuration_legacy_state_check"
          CHECK (
            ("configurationTree" IS NULL AND "configurationVersion" = 0 AND "basePrice" IS NOT NULL)
            OR ("configurationTree" IS NOT NULL AND "configurationVersion" >= 1)
          ),
        ADD CONSTRAINT "Product_configuration_shape_check"
          CHECK (
            "configurationTree" IS NULL
            OR (
              jsonb_typeof("configurationTree") = 'object'
              AND "configurationTree" ?& ARRAY['schemaVersion', 'productId', 'revision', 'basePrice', 'groups']
              AND "configurationTree" @> '{"schemaVersion":1}'::jsonb
              AND "configurationTree" ->> 'productId' = "id"
              AND "configurationTree" ->> 'revision' = "configurationVersion"::text
              AND jsonb_typeof("configurationTree" -> 'groups') = 'array'
            )
          ),
        ADD CONSTRAINT "Product_configuration_basePrice_match_check"
          CHECK (
            "configurationTree" IS NULL
            OR CASE
              WHEN "configurationTree" -> 'basePrice' = 'null'::jsonb
                THEN "basePrice" IS NULL
              WHEN jsonb_typeof("configurationTree" -> 'basePrice') = 'string'
                AND ("configurationTree" ->> 'basePrice') ~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,6})?$'
                THEN "basePrice" = ("configurationTree" ->> 'basePrice')::DECIMAL(24, 6)
              ELSE false
            END
          )
    $checks$;
  ELSIF cnt <> 5 OR valid_cnt <> 5 OR correct_names <> 5 THEN
    RAISE EXCEPTION 'WhatsApp Product CHECK fixture is incomplete or unvalidated';
  END IF;
END;
$whatsapp_e2e_constraints$;
COMMIT;
