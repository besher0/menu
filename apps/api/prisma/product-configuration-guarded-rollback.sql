-- MANUAL EMERGENCY ROLLBACK ONLY.
-- Prefer application rollback plus a forward fix after configuration data exists.
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Product" WHERE "configurationTree" IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback blocked: configurationTree contains data; export and review first';
  END IF;
  IF EXISTS (SELECT 1 FROM "ProductConfigurationDependency") THEN
    RAISE EXCEPTION 'Rollback blocked: dependency index contains data';
  END IF;
  IF EXISTS (SELECT 1 FROM "Product" WHERE "basePrice" IS NULL) THEN
    RAISE EXCEPTION 'Rollback blocked: null basePrice cannot be restored to NOT NULL safely';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Product"
    WHERE "basePrice" > 99999999.99 OR "basePrice" <> round("basePrice", 2)
  ) THEN
    RAISE EXCEPTION 'Rollback blocked: basePrice no longer fits DECIMAL(10,2)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Order"
    WHERE "totalAmount" > 99999999.99 OR "totalAmount" <> round("totalAmount", 2)
  ) THEN
    RAISE EXCEPTION 'Rollback blocked: Order.totalAmount no longer fits DECIMAL(10,2)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "OrderItem"
    WHERE "unitPrice" > 99999999.99
       OR "unitPrice" <> round("unitPrice", 2)
       OR "totalPrice" > 99999999.99
       OR "totalPrice" <> round("totalPrice", 2)
  ) THEN
    RAISE EXCEPTION 'Rollback blocked: OrderItem money no longer fits DECIMAL(10,2)';
  END IF;
END $$;

DROP TABLE "ProductConfigurationDependency";

ALTER TABLE "Product"
  DROP CONSTRAINT "Product_configurationVersion_nonnegative_check",
  DROP CONSTRAINT "Product_basePrice_nonnegative_check",
  DROP CONSTRAINT "Product_configuration_legacy_state_check",
  DROP CONSTRAINT "Product_configuration_shape_check",
  DROP CONSTRAINT "Product_configuration_basePrice_match_check";

DROP INDEX "Product_restaurantId_id_configurationVersion_key";
DROP INDEX "Product_restaurantId_id_key";

ALTER TABLE "Product"
  DROP COLUMN "configurationTree",
  DROP COLUMN "configurationVersion",
  ALTER COLUMN "basePrice" TYPE DECIMAL(10, 2)
    USING "basePrice"::DECIMAL(10, 2),
  ALTER COLUMN "basePrice" SET NOT NULL;

ALTER TABLE "Order"
  ALTER COLUMN "totalAmount" TYPE DECIMAL(10, 2)
    USING "totalAmount"::DECIMAL(10, 2);

ALTER TABLE "OrderItem"
  ALTER COLUMN "unitPrice" TYPE DECIMAL(10, 2)
    USING "unitPrice"::DECIMAL(10, 2),
  ALTER COLUMN "totalPrice" TYPE DECIMAL(10, 2)
    USING "totalPrice"::DECIMAL(10, 2);

DROP TYPE "LinkedProductMode";

COMMIT;
