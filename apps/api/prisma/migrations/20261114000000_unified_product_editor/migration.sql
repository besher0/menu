-- Two additive columns and a V2 schema discriminator. No existing row is rewritten.
BEGIN;
-- No implicit V1 conversion. The owner reports no saved Network configurations.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Product" WHERE "configurationTree" IS NOT NULL
    AND NOT ("configurationTree" @> '{"schemaVersion":2}'::jsonb)) THEN
    RAISE EXCEPTION 'Unsupported saved Network configuration: review before migrating; no conversion performed';
  END IF;
END $$;
ALTER TABLE "Product" ADD COLUMN "editVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MealDetailLibraryItem" ADD COLUMN "valueType" TEXT NOT NULL DEFAULT 'VALUE';
ALTER TABLE "MealDetailLibraryItem" ADD CONSTRAINT "MealDetailLibraryItem_valueType_check"
  CHECK ("valueType" IN ('VALUE', 'PRESENCE'));
-- Preserve the identity/revision/base consistency checks; replace only the obsolete schema discriminator.
ALTER TABLE "Product" DROP CONSTRAINT "Product_configuration_shape_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_configuration_shape_check" CHECK (
  "configurationTree" IS NULL OR (
    jsonb_typeof("configurationTree") = 'object'
    AND "configurationTree" ?& ARRAY['schemaVersion', 'productId', 'revision', 'basePrice', 'groups']
    AND "configurationTree" @> '{"schemaVersion":2}'::jsonb
    AND "configurationTree" ->> 'productId' = "id"
    AND "configurationTree" ->> 'revision' = "configurationVersion"::text
    AND jsonb_typeof("configurationTree" -> 'groups') = 'array'
  )
);
COMMIT;
