-- Stage 6F.3: synthetic checks against a NEW disposable DB after Stage 2C + 6C SQL.
DO $$
BEGIN
  IF (SELECT count(*) FROM "Restaurant" WHERE "id" IN ('s6f3-r1','s6f3-r2')) <> 2
     OR (SELECT count(*) FROM "Category" WHERE "id" IN ('s6f3-c1','s6f3-c2')) <> 2
     OR (SELECT count(*) FROM "ProductOptionGroup" WHERE "id" = 's6f3-group') <> 1
     OR (SELECT count(*) FROM "ProductOption" WHERE "id" = 's6f3-option' AND "priceDelta" = 500) <> 1
     OR (SELECT count(*) FROM "Order" WHERE "id" = 's6f3-order' AND "totalAmount" = 13000 AND "source" = 'WHATSAPP') <> 1
     OR (SELECT count(*) FROM "OrderItem" WHERE "id" = 's6f3-item' AND "totalPrice" = 13000) <> 1
     OR (SELECT count(*) FROM "AnalyticsEvent" WHERE "id" = 's6f3-analytics') <> 1
     OR (SELECT count(*) FROM "Product" WHERE "id" = 's6f3-legacy' AND "basePrice" = 12500 AND "configurationTree" IS NULL AND "configurationVersion" = 0) <> 1 THEN
    RAISE EXCEPTION 'synthetic legacy preservation failed';
  END IF;
END $$;

INSERT INTO "Product" ("id", "restaurantId", "categoryId", "name", "slug", "basePrice", "configurationTree", "configurationVersion", "currency", "updatedAt") VALUES
  ('s6f3-network-null', 's6f3-r1', 's6f3-c1', 'Network Null', 'network-null', NULL,
   '{"schemaVersion":1,"productId":"s6f3-network-null","revision":1,"basePrice":null,"groups":[]}'::jsonb, 1, 'SYP', now()),
  ('s6f3-network-zero', 's6f3-r1', 's6f3-c1', 'Network Zero', 'network-zero', 0,
   '{"schemaVersion":1,"productId":"s6f3-network-zero","revision":1,"basePrice":"0","groups":[]}'::jsonb, 1, 'SYP', now());

INSERT INTO "ProductConfigurationDependency"
  ("id", "restaurantId", "productId", "sourceProductId", "optionId", "path", "mode", "configurationVersion")
VALUES
  ('s6f3-dep', 's6f3-r1', 's6f3-network-null', 's6f3-source', 'option-1', 'groups/0/options/0', 'ORIGINAL', 1);

DO $$
BEGIN
  BEGIN
    INSERT INTO "ProductConfigurationDependency"
      ("id", "restaurantId", "productId", "sourceProductId", "optionId", "path", "mode", "configurationVersion")
    VALUES ('s6f3-cross', 's6f3-r1', 's6f3-network-null', 's6f3-other', 'option-2', 'groups/0/options/1', 'CUSTOM', 1);
    RAISE EXCEPTION 'cross-restaurant dependency unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "ProductConfigurationDependency"
      ("id", "restaurantId", "productId", "sourceProductId", "optionId", "path", "mode", "configurationVersion")
    VALUES ('s6f3-self', 's6f3-r1', 's6f3-network-null', 's6f3-network-null', 'option-3', 'groups/0/options/2', 'ORIGINAL', 1);
    RAISE EXCEPTION 'self-link unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE "Product" SET "basePrice" = 1 WHERE "id" = 's6f3-network-null';
    RAISE EXCEPTION 'basePrice/tree mismatch unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT "basePrice" FROM "Product" WHERE "id" = 's6f3-network-null') IS NOT NULL
     OR (SELECT "basePrice" FROM "Product" WHERE "id" = 's6f3-network-zero') <> 0
     OR (SELECT count(*) FROM "ProductConfigurationDependency" WHERE "id" = 's6f3-dep') <> 1 THEN
    RAISE EXCEPTION 'network fixture assertions failed';
  END IF;
END $$;

-- Legacy checkout remains writable after Stage 6C; new nullable fields stay NULL.
INSERT INTO "Order" ("id", "restaurantId", "totalAmount", "currency", "status", "source")
VALUES ('s6f3-order-after', 's6f3-r1', 12500, 'SYP', 'PENDING_WHATSAPP', 'WHATSAPP');
INSERT INTO "OrderItem" ("id", "orderId", "productId", "name", "quantity", "unitPrice", "totalPrice")
VALUES ('s6f3-item-after', 's6f3-order-after', 's6f3-legacy', 'Legacy Pizza', 1, 12500, 12500);
DO $$
BEGIN
  IF (SELECT count(*) FROM "Order" WHERE "id" = 's6f3-order-after' AND "idempotencyKey" IS NULL AND "requestHash" IS NULL AND "acceptanceTokenHash" IS NULL AND "networkSnapshotSealedAt" IS NULL) <> 1
     OR (SELECT count(*) FROM "OrderItem" WHERE "id" = 's6f3-item-after') <> 1 THEN
    RAISE EXCEPTION 'legacy order after migration failed';
  END IF;
END $$;

SELECT 'STAGE6F3_SYNTHETIC_ASSERTIONS_PASS' AS result;
