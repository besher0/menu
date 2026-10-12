-- OrderSawa Product Configuration Network.
-- This migration is intentionally schema-only: legacy option backfill is a
-- separately invoked, resumable command after deployment verification.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TYPE "LinkedProductMode" AS ENUM ('ORIGINAL', 'CUSTOM');

ALTER TABLE "Product"
  ALTER COLUMN "basePrice" TYPE DECIMAL(24, 6)
    USING "basePrice"::DECIMAL(24, 6),
  ALTER COLUMN "basePrice" DROP NOT NULL,
  ADD COLUMN "configurationTree" JSONB,
  ADD COLUMN "configurationVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order"
  ALTER COLUMN "totalAmount" TYPE DECIMAL(24, 6)
    USING "totalAmount"::DECIMAL(24, 6);

ALTER TABLE "OrderItem"
  ALTER COLUMN "unitPrice" TYPE DECIMAL(24, 6)
    USING "unitPrice"::DECIMAL(24, 6),
  ALTER COLUMN "totalPrice" TYPE DECIMAL(24, 6)
    USING "totalPrice"::DECIMAL(24, 6);

CREATE UNIQUE INDEX "Product_restaurantId_id_key"
  ON "Product"("restaurantId", "id");

CREATE UNIQUE INDEX "Product_restaurantId_id_configurationVersion_key"
  ON "Product"("restaurantId", "id", "configurationVersion");

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

CREATE TABLE "ProductConfigurationDependency" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sourceProductId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "mode" "LinkedProductMode" NOT NULL,
  "configurationVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductConfigurationDependency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductConfigurationDependency_not_self_check"
    CHECK ("productId" <> "sourceProductId"),
  CONSTRAINT "ProductConfigurationDependency_version_positive_check"
    CHECK ("configurationVersion" >= 1),
  CONSTRAINT "ProductConfigurationDependency_optionId_not_blank_check"
    CHECK (length(trim("optionId")) > 0),
  CONSTRAINT "ProductConfigurationDependency_path_not_blank_check"
    CHECK (length(trim("path")) > 0),
  CONSTRAINT "ProductConfigurationDependency_owner_fkey"
    FOREIGN KEY ("restaurantId", "productId", "configurationVersion")
    REFERENCES "Product"("restaurantId", "id", "configurationVersion")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductConfigurationDependency_source_fkey"
    FOREIGN KEY ("restaurantId", "sourceProductId")
    REFERENCES "Product"("restaurantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductConfigDependency_product_path_key"
  ON "ProductConfigurationDependency"("productId", "path");

CREATE INDEX "ProductConfigDependency_restaurant_source_idx"
  ON "ProductConfigurationDependency"("restaurantId", "sourceProductId");

CREATE INDEX "ProductConfigDependency_product_version_idx"
  ON "ProductConfigurationDependency"("productId", "configurationVersion");

-- Existing products remain in the legacy state. Validation does not backfill
-- or rewrite any restaurant data.
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_configurationVersion_nonnegative_check";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_basePrice_nonnegative_check";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_configuration_legacy_state_check";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_configuration_shape_check";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_configuration_basePrice_match_check";

COMMIT;
