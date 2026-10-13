-- Stage 6D.3C3E candidate only. NOT an operational migration.
-- Apply only to a fresh, isolated PostgreSQL 16 disposable DB after the test baseline + Stage 6C SQL.
-- Future adoption requires migration-history audit, an approved migration, and a fresh compatibility review.
DO $$ BEGIN
  IF current_database() NOT IN ('ordersawa_stage3_stage6c_stage6d3c3e_guard',
    'ordersawa_stage3_stage6c_stage6d3c3e_integration')
    OR host(inet_server_addr()) <> '127.0.0.1' OR inet_server_port() <> 55440
    OR EXISTS (SELECT 1 FROM public."Order") THEN
    RAISE EXCEPTION 'Refusing non-empty or non-disposable Stage 6D.3C3E database';
  END IF;
END $$;

-- Exact non-negative decimal text compatible with DECIMAL(24,6). NULL means invalid.
-- This validates stored evidence only; it does not calculate the commercial price.
CREATE FUNCTION public.network_order_guard_money(value jsonb) RETURNS numeric
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'string'
    AND value #>> '{}' ~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,6})?$'
    THEN (value #>> '{}')::numeric ELSE NULL END;
$$;

CREATE FUNCTION public.require_complete_network_test_order() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
DECLARE
  saved public."Order"%ROWTYPE;
  snap jsonb;
  item jsonb;
  price_line jsonb;
  stored public."OrderItem"%ROWTYPE;
  total numeric := 0;
  line_total numeric;
  unit_price numeric;
  line_charges numeric;
  amount numeric;
  charge numeric;
  item_count bigint;
  units bigint := 0;
  stored_sum numeric;
  multiset_diff boolean;
BEGIN
  -- A deferred INSERT event reads the final state after OrderItems and seal in this transaction.
  SELECT * INTO saved FROM public."Order" WHERE "id" = NEW."id";
  IF NOT FOUND OR saved."source" <> 'NETWORK_TEST' THEN RETURN NULL; END IF;
  snap := saved."cartSnapshot"::jsonb;
  IF saved."networkSnapshotSealedAt" IS NULL OR snap IS NULL
    OR jsonb_typeof(snap) <> 'object'
    OR snap->'snapshotVersion' IS DISTINCT FROM '1'::jsonb
    OR snap->>'mode' IS DISTINCT FROM 'NETWORK'
    OR snap->>'locale' IS NULL OR snap->>'locale' NOT IN ('ar', 'en')
    OR jsonb_typeof(snap->'orderDetails') IS DISTINCT FROM 'object'
    OR nullif(btrim(snap#>>'{orderDetails,restaurantName}'), '') IS NULL
    OR (snap#>'{orderDetails,customerName}' IS NOT NULL
      AND jsonb_typeof(snap#>'{orderDetails,customerName}') IS DISTINCT FROM 'string')
    OR (snap#>'{orderDetails,customerPhone}' IS NOT NULL
      AND jsonb_typeof(snap#>'{orderDetails,customerPhone}') IS DISTINCT FROM 'string')
    OR snap#>>'{orderDetails,customerName}' IS DISTINCT FROM saved."customerName"
    OR snap#>>'{orderDetails,customerPhone}' IS DISTINCT FROM saved."customerPhone"
    OR jsonb_typeof(snap->'currency') IS DISTINCT FROM 'string'
    OR nullif(btrim(saved."currency"), '') IS NULL
    OR saved."currency" !~ '^[A-Z]{3}$'
    OR snap->>'currency' IS DISTINCT FROM saved."currency"
    OR public.network_order_guard_money(snap->'totalAmount') IS NULL
    OR public.network_order_guard_money(snap->'totalAmount') IS DISTINCT FROM saved."totalAmount"
    OR saved."totalAmount" < 0
    OR jsonb_typeof(snap->'items') IS DISTINCT FROM 'array'
    OR saved."idempotencyKey" IS NULL OR saved."idempotencyKey" !~ '^[A-Za-z0-9_-]{16,128}$'
    OR saved."requestHash" IS NULL OR saved."requestHash" !~ '^[0-9a-f]{64}$'
    OR saved."acceptanceTokenHash" IS NULL OR saved."acceptanceTokenHash" !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Incomplete Network Order envelope' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(snap->'items') NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid Network Order line count' USING ERRCODE = '23514';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(snap->'items') AS value LOOP
    IF jsonb_typeof(item) <> 'object'
      OR item->'snapshotVersion' IS DISTINCT FROM '1'::jsonb
      OR item->>'mode' IS DISTINCT FROM 'NETWORK'
      OR item->>'locale' IS DISTINCT FROM snap->>'locale'
      OR item->>'currency' IS DISTINCT FROM saved."currency"
      OR jsonb_typeof(item->'productId') IS DISTINCT FROM 'string'
      OR nullif(btrim(item->>'productId'), '') IS NULL
      OR jsonb_typeof(item->'productName') IS DISTINCT FROM 'string'
      OR nullif(btrim(item->>'productName'), '') IS NULL
      OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number'
      OR item->>'quantity' !~ '^([1-9][0-9]?|100)$'
      OR jsonb_typeof(item->'configurationTree') IS DISTINCT FROM 'object'
      OR jsonb_typeof(item->'canonicalSelection') IS DISTINCT FROM 'object'
      OR item#>>'{configurationTree,productId}' IS DISTINCT FROM item->>'productId'
      OR item#>>'{canonicalSelection,productId}' IS DISTINCT FROM item->>'productId'
      OR jsonb_typeof(item->'configurationRevision') IS DISTINCT FROM 'number'
      OR jsonb_typeof(item#>'{configurationTree,revision}') IS DISTINCT FROM 'number'
      OR jsonb_typeof(item#>'{canonicalSelection,configurationRevision}') IS DISTINCT FROM 'number'
      OR item->>'configurationRevision' !~ '^[1-9][0-9]*$'
      OR item#>>'{configurationTree,revision}' IS DISTINCT FROM item->>'configurationRevision'
      OR item#>>'{canonicalSelection,configurationRevision}' IS DISTINCT FROM item->>'configurationRevision'
      OR jsonb_typeof(item->'linkedSources') IS DISTINCT FROM 'array'
      OR jsonb_typeof(item->'priceBreakdown') IS DISTINCT FROM 'array'
      OR public.network_order_guard_money(item->'unitPrice') IS NULL
      OR public.network_order_guard_money(item->'lineTotal') IS NULL THEN
      RAISE EXCEPTION 'Invalid Network Order line evidence' USING ERRCODE = '23514';
    END IF;
    unit_price := public.network_order_guard_money(item->'unitPrice');
    line_total := public.network_order_guard_money(item->'lineTotal');
    units := units + (item->>'quantity')::bigint;
    IF unit_price * (item->>'quantity')::numeric IS DISTINCT FROM line_total THEN
      RAISE EXCEPTION 'Network Order line amount mismatch' USING ERRCODE = '23514';
    END IF;
    total := total + line_total;
    line_charges := 0;
    FOR price_line IN SELECT value FROM jsonb_array_elements(item->'priceBreakdown') AS value LOOP
      IF jsonb_typeof(price_line) <> 'object'
        OR jsonb_typeof(price_line->'included') IS DISTINCT FROM 'boolean'
        OR public.network_order_guard_money(price_line->'amount') IS NULL
        OR public.network_order_guard_money(price_line->'chargedAmount') IS NULL THEN
        RAISE EXCEPTION 'Invalid Network Order price evidence' USING ERRCODE = '23514';
      END IF;
      amount := public.network_order_guard_money(price_line->'amount');
      charge := public.network_order_guard_money(price_line->'chargedAmount');
      IF (price_line->'included' = 'true'::jsonb AND charge <> 0)
        OR (price_line->'included' = 'false'::jsonb AND charge <> amount) THEN
        RAISE EXCEPTION 'Inconsistent included Network Order price' USING ERRCODE = '23514';
      END IF;
      line_charges := line_charges + charge;
    END LOOP;
    IF line_charges IS DISTINCT FROM unit_price THEN
      RAISE EXCEPTION 'Network Order price breakdown mismatch' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF units > 100 OR total IS DISTINCT FROM saved."totalAmount" THEN
    RAISE EXCEPTION 'Network Order total mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), coalesce(sum("totalPrice"), 0)
    INTO item_count, stored_sum FROM public."OrderItem" WHERE "orderId" = saved."id";
  IF item_count <> jsonb_array_length(snap->'items') OR stored_sum IS DISTINCT FROM saved."totalAmount" THEN
    RAISE EXCEPTION 'Network Order items missing or extra' USING ERRCODE = '23514';
  END IF;
  FOR stored IN SELECT * FROM public."OrderItem" WHERE "orderId" = saved."id" LOOP
    item := stored."options"::jsonb;
    IF item IS NULL OR jsonb_typeof(item) <> 'object'
      OR stored."productId" IS NULL
      OR NOT EXISTS (SELECT 1 FROM public."Product" p WHERE p."id" = stored."productId"
        AND p."restaurantId" = saved."restaurantId")
      OR item->>'productId' IS DISTINCT FROM stored."productId"
      OR item->>'productName' IS DISTINCT FROM stored."name"
      OR item->>'note' IS DISTINCT FROM stored."note"
      OR item->>'currency' IS DISTINCT FROM saved."currency"
      OR item->>'quantity' IS DISTINCT FROM stored."quantity"::text
      OR public.network_order_guard_money(item->'unitPrice') IS DISTINCT FROM stored."unitPrice"
      OR public.network_order_guard_money(item->'lineTotal') IS DISTINCT FROM stored."totalPrice"
      OR stored."quantity" NOT BETWEEN 1 AND 100
      OR stored."unitPrice" < 0 OR stored."totalPrice" < 0
      OR stored."unitPrice" * stored."quantity" IS DISTINCT FROM stored."totalPrice" THEN
      RAISE EXCEPTION 'Network OrderItem differs from sealed evidence' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- OrderItem has no persisted ordinal. Compare exact JSONB multisets, retaining duplicates.
  WITH snapshot_counts AS (
    SELECT value AS evidence, count(*) AS n
      FROM jsonb_array_elements(snap->'items') AS value GROUP BY value
  ), stored_counts AS (
    SELECT "options"::jsonb AS evidence, count(*) AS n
      FROM public."OrderItem" WHERE "orderId" = saved."id" GROUP BY "options"::jsonb
  )
  SELECT EXISTS (
    SELECT 1 FROM snapshot_counts s FULL JOIN stored_counts d USING (evidence)
      WHERE s.n IS DISTINCT FROM d.n
  ) INTO multiset_diff;
  IF multiset_diff THEN
    RAISE EXCEPTION 'Network OrderItem evidence multiset mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

-- A single deferred INSERT event validates final state at COMMIT; source transitions are covered.
-- Existing Stage 6C immutability triggers block post-seal evidence mutation and deletion.
CREATE CONSTRAINT TRIGGER "Order_network_test_completeness_guard"
  AFTER INSERT OR UPDATE OF "source" ON public."Order"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.require_complete_network_test_order();
