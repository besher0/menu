-- Experimental only. Never add this file to Prisma migration history or run on an existing database.
DO $$ BEGIN
  IF current_database() NOT IN ('ordersawa_stage3_stage6c_stage6d3c3d_a', 'ordersawa_stage3_stage6c_stage6d3c3d_b')
    OR host(inet_server_addr()) <> '127.0.0.1' OR inet_server_port() <> 55440 THEN
    RAISE EXCEPTION 'Stage 6D.3C3D disposable database required';
  END IF;
END $$;

CREATE FUNCTION "poc_require_complete_network_order"() RETURNS trigger AS $$
DECLARE
  saved "Order"%ROWTYPE;
  snapshot jsonb;
  item_count bigint;
  item_sum numeric;
BEGIN
  SELECT * INTO saved FROM "Order" WHERE "id" = NEW."id";
  IF NOT FOUND OR saved."source" <> 'NETWORK_TEST' THEN RETURN NULL; END IF;
  snapshot := saved."cartSnapshot"::jsonb;
  IF saved."networkSnapshotSealedAt" IS NULL OR snapshot IS NULL
    OR jsonb_typeof(snapshot) <> 'object'
    OR snapshot->>'mode' IS DISTINCT FROM 'NETWORK'
    OR snapshot->>'snapshotVersion' IS DISTINCT FROM '1'
    OR snapshot->>'currency' IS DISTINCT FROM saved."currency"
    OR jsonb_typeof(snapshot->'items') IS DISTINCT FROM 'array'
    OR snapshot->>'totalAmount' IS NULL
    OR snapshot->>'totalAmount' !~ '^[0-9]+(\.[0-9]{1,6})?$'
    OR (snapshot->>'totalAmount')::numeric IS DISTINCT FROM saved."totalAmount"
    OR saved."requestHash" IS NULL OR saved."idempotencyKey" IS NULL
    OR saved."acceptanceTokenHash" IS NULL THEN
    RAISE EXCEPTION 'POC incomplete Network Order snapshot' USING ERRCODE = '23514';
  END IF;
  SELECT count(*), coalesce(sum("totalPrice"), 0) INTO item_count, item_sum
  FROM "OrderItem" WHERE "orderId" = saved."id";
  IF item_count < 1 OR item_count <> jsonb_array_length(snapshot->'items')
    OR item_sum IS DISTINCT FROM saved."totalAmount"
    OR EXISTS (SELECT 1 FROM "OrderItem" WHERE "orderId" = saved."id"
      AND ("quantity" < 1 OR "unitPrice" * "quantity" <> "totalPrice"
        OR "options" IS NULL OR jsonb_typeof("options"::jsonb) <> 'object'
        OR "options"::jsonb->>'productId' IS DISTINCT FROM "productId"
        OR "options"::jsonb->>'productName' IS DISTINCT FROM "name"
        OR "options"::jsonb->>'note' IS DISTINCT FROM "note"
        OR "options"::jsonb->>'currency' IS DISTINCT FROM saved."currency"
        OR ("options"::jsonb->>'quantity')::int IS DISTINCT FROM "quantity"
        OR ("options"::jsonb->>'unitPrice')::numeric IS DISTINCT FROM "unitPrice"
        OR ("options"::jsonb->>'lineTotal')::numeric IS DISTINCT FROM "totalPrice"))
    OR EXISTS (
      SELECT 1 FROM
        (SELECT "options"::jsonb AS item, count(*) AS n FROM "OrderItem"
          WHERE "orderId" = saved."id" GROUP BY "options"::jsonb) AS stored
      FULL JOIN
        (SELECT value AS item, count(*) AS n FROM jsonb_array_elements(snapshot->'items') AS value
          GROUP BY value) AS historical ON stored.item = historical.item
      WHERE stored.n IS DISTINCT FROM historical.n
    ) THEN
    RAISE EXCEPTION 'POC incomplete Network Order items' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "PoC_order_complete_at_commit"
  AFTER INSERT OR UPDATE ON "Order" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION "poc_require_complete_network_order"();

-- PostgreSQL resolves the row type when compiling the function below. A has an unused test table;
-- only B installs the bidirectional Claim triggers. A's proposed runtime design needs no new table.
CREATE TABLE "PoCOrderClaim" (
  "restaurantId" text NOT NULL REFERENCES "Restaurant"("id"),
  "idempotencyKey" text NOT NULL,
  "acceptanceTokenHash" text NOT NULL,
  "requestHash" text NOT NULL,
  "orderId" text UNIQUE REFERENCES "Order"("id"),
  PRIMARY KEY ("restaurantId", "idempotencyKey"),
  UNIQUE ("restaurantId", "acceptanceTokenHash")
);

CREATE FUNCTION "poc_require_claim_complete"() RETURNS trigger AS $$
DECLARE
  saved "PoCOrderClaim"%ROWTYPE;
  matched boolean;
BEGIN
  SELECT * INTO saved FROM "PoCOrderClaim"
    WHERE "restaurantId" = NEW."restaurantId" AND "idempotencyKey" = NEW."idempotencyKey";
  IF NOT FOUND THEN RAISE EXCEPTION 'POC Claim disappeared' USING ERRCODE = '23514'; END IF;
  SELECT true INTO matched FROM "Order" o WHERE o."id" = saved."orderId"
    AND o."restaurantId" = saved."restaurantId"
    AND o."idempotencyKey" = saved."idempotencyKey"
    AND o."acceptanceTokenHash" = saved."acceptanceTokenHash"
    AND o."requestHash" = saved."requestHash"
    AND o."source" = 'NETWORK_TEST' AND o."networkSnapshotSealedAt" IS NOT NULL;
  IF saved."orderId" IS NULL OR NOT coalesce(matched, false) THEN
    RAISE EXCEPTION 'POC Claim has no matching sealed Order' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "poc_claim_immutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'POC Claim cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF OLD."restaurantId" IS DISTINCT FROM NEW."restaurantId"
    OR OLD."idempotencyKey" IS DISTINCT FROM NEW."idempotencyKey"
    OR OLD."acceptanceTokenHash" IS DISTINCT FROM NEW."acceptanceTokenHash"
    OR OLD."requestHash" IS DISTINCT FROM NEW."requestHash"
    OR OLD."orderId" IS NOT NULL THEN
    RAISE EXCEPTION 'POC Claim is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "poc_require_order_claim"() RETURNS trigger AS $$
DECLARE matched boolean;
BEGIN
  IF NEW."source" <> 'NETWORK_TEST' THEN RETURN NULL; END IF;
  SELECT true INTO matched FROM "PoCOrderClaim" c WHERE c."orderId" = NEW."id"
    AND c."restaurantId" = NEW."restaurantId"
    AND c."idempotencyKey" = NEW."idempotencyKey"
    AND c."acceptanceTokenHash" = NEW."acceptanceTokenHash"
    AND c."requestHash" = NEW."requestHash";
  IF NOT coalesce(matched, false) THEN
    RAISE EXCEPTION 'POC Order has no matching Claim' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF current_database() = 'ordersawa_stage3_stage6c_stage6d3c3d_b' THEN
    CREATE CONSTRAINT TRIGGER "PoC_claim_complete_at_commit"
      AFTER INSERT OR UPDATE ON "PoCOrderClaim" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION "poc_require_claim_complete"();
    CREATE TRIGGER "PoC_claim_immutable_update" BEFORE UPDATE ON "PoCOrderClaim"
      FOR EACH ROW EXECUTE FUNCTION "poc_claim_immutable"();
    CREATE TRIGGER "PoC_claim_immutable_delete" BEFORE DELETE ON "PoCOrderClaim"
      FOR EACH ROW EXECUTE FUNCTION "poc_claim_immutable"();
    CREATE CONSTRAINT TRIGGER "PoC_order_must_have_claim"
      AFTER INSERT OR UPDATE ON "Order" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION "poc_require_order_claim"();
  END IF;
END $$;
