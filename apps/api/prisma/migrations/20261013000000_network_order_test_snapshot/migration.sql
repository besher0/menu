-- Stage 6C is additive. The new status and source are test-only until a later activation decision.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'VALIDATED_TEST';

ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Order" ADD COLUMN "requestHash" TEXT;
ALTER TABLE "Order" ADD COLUMN "acceptanceTokenHash" TEXT;
ALTER TABLE "Order" ADD COLUMN "networkSnapshotSealedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Order_restaurantId_idempotencyKey_key"
  ON "Order"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX "Order_restaurantId_acceptanceTokenHash_key"
  ON "Order"("restaurantId", "acceptanceTokenHash");

ALTER TABLE "Order" ADD CONSTRAINT "Order_network_test_idempotency_check"
  CHECK ("source" <> 'NETWORK_TEST' OR
    ("idempotencyKey" IS NOT NULL AND "requestHash" IS NOT NULL AND "acceptanceTokenHash" IS NOT NULL));

-- Freeze financial and descriptive evidence while allowing a future status transition.
CREATE FUNCTION "prevent_network_order_snapshot_update"() RETURNS trigger AS $$
BEGIN
  IF OLD."source" = 'NETWORK_TEST' AND (
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."restaurantId" IS DISTINCT FROM OLD."restaurantId" OR
    NEW."branchId" IS DISTINCT FROM OLD."branchId" OR
    NEW."customerName" IS DISTINCT FROM OLD."customerName" OR
    NEW."customerPhone" IS DISTINCT FROM OLD."customerPhone" OR
    NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."cartSnapshot" IS DISTINCT FROM OLD."cartSnapshot" OR
    NEW."whatsappMessage" IS DISTINCT FROM OLD."whatsappMessage" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR
    NEW."source" IS DISTINCT FROM OLD."source" OR
    NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
    NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR NEW."acceptanceTokenHash" IS DISTINCT FROM OLD."acceptanceTokenHash"
  ) THEN
    RAISE EXCEPTION 'NETWORK_TEST order snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."source" = 'NETWORK_TEST' AND NEW."networkSnapshotSealedAt" IS DISTINCT FROM OLD."networkSnapshotSealedAt"
    AND (OLD."networkSnapshotSealedAt" IS NOT NULL OR NEW."networkSnapshotSealedAt" IS NULL) THEN
    RAISE EXCEPTION 'NETWORK_TEST snapshot seal cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_network_snapshot_immutable"
  BEFORE UPDATE ON "Order" FOR EACH ROW
  EXECUTE FUNCTION "prevent_network_order_snapshot_update"();

CREATE FUNCTION "prevent_network_order_delete"() RETURNS trigger AS $$
BEGIN
  IF OLD."source" = 'NETWORK_TEST' THEN
    RAISE EXCEPTION 'NETWORK_TEST order snapshot cannot be deleted' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_network_snapshot_no_delete"
  BEFORE DELETE ON "Order" FOR EACH ROW
  EXECUTE FUNCTION "prevent_network_order_delete"();

CREATE FUNCTION "require_network_order_snapshot_seal"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Order" WHERE "id" = NEW."id" AND "source" = 'NETWORK_TEST' AND "networkSnapshotSealedAt" IS NULL) THEN
    RAISE EXCEPTION 'NETWORK_TEST order must be sealed before commit' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Order_network_snapshot_seal_required"
  AFTER INSERT OR UPDATE ON "Order" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION "require_network_order_snapshot_seal"();

CREATE FUNCTION "prevent_network_order_item_snapshot_update"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Order" WHERE "id" = OLD."orderId" AND "source" = 'NETWORK_TEST') AND (
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."orderId" IS DISTINCT FROM OLD."orderId" OR
    NEW."productId" IS DISTINCT FROM OLD."productId" OR
    NEW."name" IS DISTINCT FROM OLD."name" OR
    NEW."quantity" IS DISTINCT FROM OLD."quantity" OR
    NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice" OR
    NEW."totalPrice" IS DISTINCT FROM OLD."totalPrice" OR
    NEW."options" IS DISTINCT FROM OLD."options" OR
    NEW."note" IS DISTINCT FROM OLD."note"
  ) THEN
    RAISE EXCEPTION 'NETWORK_TEST order item snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrderItem_network_snapshot_immutable"
  BEFORE UPDATE ON "OrderItem" FOR EACH ROW
  EXECUTE FUNCTION "prevent_network_order_item_snapshot_update"();

CREATE FUNCTION "prevent_network_order_item_structural_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM "Order" WHERE "id" = NEW."orderId" AND "source" = 'NETWORK_TEST' AND "networkSnapshotSealedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'NETWORK_TEST order item is sealed' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM "Order" WHERE "id" = OLD."orderId" AND "source" = 'NETWORK_TEST') THEN
    RAISE EXCEPTION 'NETWORK_TEST order item cannot be deleted' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrderItem_network_snapshot_no_late_insert"
  BEFORE INSERT ON "OrderItem" FOR EACH ROW
  EXECUTE FUNCTION "prevent_network_order_item_structural_change"();
CREATE TRIGGER "OrderItem_network_snapshot_no_delete"
  BEFORE DELETE ON "OrderItem" FOR EACH ROW
  EXECUTE FUNCTION "prevent_network_order_item_structural_change"();
