-- Disposable test baseline only. Exact Product CHECK expressions from
-- 20261012000000_product_configuration_network/migration.sql (Stage 2C).
-- Run only against a fresh local ordersawa_stage3_* database.
DO $$ BEGIN
  IF current_database() NOT LIKE 'ordersawa_stage3_%'
    OR host(inet_server_addr()) <> '127.0.0.1'
    OR inet_server_port() <> 55440 THEN
    RAISE EXCEPTION 'Disposable PostgreSQL on loopback port 55440 required';
  END IF;
END $$;
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_configurationVersion_nonnegative_check"
    CHECK ("configurationVersion" >= 0) NOT VALID,
  ADD CONSTRAINT "Product_basePrice_nonnegative_check"
    CHECK ("basePrice" IS NULL OR "basePrice" >= 0) NOT VALID,
  ADD CONSTRAINT "Product_configuration_legacy_state_check"
    CHECK (
      ("configurationTree" IS NULL AND "configurationVersion" = 0 AND "basePrice" IS NOT NULL)
      OR
      ("configurationTree" IS NOT NULL AND "configurationVersion" >= 1)
    ) NOT VALID,
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
    ) NOT VALID,
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
    ) NOT VALID;

ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_configurationVersion_nonnegative_check";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_basePrice_nonnegative_check";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_configuration_legacy_state_check";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_configuration_shape_check";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_configuration_basePrice_match_check";
