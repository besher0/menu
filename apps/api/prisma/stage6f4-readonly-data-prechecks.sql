-- REVIEW ONLY. Never run on Production without explicit, separate read-only approval.
-- Aggregate counts only: no names, individual prices, customer fields, credentials or migration logs.
-- Designed for the documented PRE-Stage-2C Restaurant schema; STOP if columns differ.
\set ON_ERROR_STOP on
\pset pager off
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';

-- Exact numeric typmods omitted by the supplied schema.json-derived report.
SELECT c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS exact_type, a.attnotnull AS not_null
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
  AND (c.relname, a.attname) IN (
    ('Product','basePrice'), ('ProductOption','priceDelta'),
    ('Order','totalAmount'), ('OrderItem','unitPrice'), ('OrderItem','totalPrice'))
ORDER BY c.relname, a.attname;

SELECT (SELECT count(*) FROM "Restaurant") AS restaurants,
       (SELECT count(*) FROM "Category") AS categories,
       (SELECT count(*) FROM "Product") AS products,
       (SELECT count(*) FROM "ProductOptionGroup") AS option_groups,
       (SELECT count(*) FROM "ProductOption") AS options,
       (SELECT count(*) FROM "Order") AS orders,
       (SELECT count(*) FROM "OrderItem") AS order_items,
       (SELECT count(*) FROM "AnalyticsEvent") AS analytics_events;

-- A DECIMAL(24,6) cast may silently round values with more than six meaningful
-- places; values rounding to >=10^18 cannot fit. No individual values are shown.
SELECT count(*) FILTER (WHERE "basePrice" < 0) AS negative_base,
       count(*) FILTER (WHERE "basePrice" <> round("basePrice", 6)) AS base_over_six_places,
       count(*) FILTER (WHERE abs(round("basePrice", 6)) >= 1000000000000000000::numeric) AS base_overflow,
       count(*) FILTER (WHERE "currency" IN ('SYP','ل.س')
                           AND "basePrice" <> trunc("basePrice")) AS fractional_syp_base
FROM "Product";

SELECT count(*) FILTER (WHERE "totalAmount" < 0) AS negative_order_total,
       count(*) FILTER (WHERE "totalAmount" <> round("totalAmount", 6)) AS order_over_six_places,
       count(*) FILTER (WHERE abs(round("totalAmount", 6)) >= 1000000000000000000::numeric) AS order_overflow,
       count(*) FILTER (WHERE "currency" IN ('SYP','ل.س')
                           AND "totalAmount" <> trunc("totalAmount")) AS fractional_syp_order
FROM "Order";

SELECT count(*) FILTER (WHERE "unitPrice" <> round("unitPrice", 6)
                         OR "totalPrice" <> round("totalPrice", 6)) AS item_over_six_places,
       count(*) FILTER (WHERE abs(round("unitPrice", 6)) >= 1000000000000000000::numeric
                         OR abs(round("totalPrice", 6)) >= 1000000000000000000::numeric) AS item_overflow
FROM "OrderItem";

-- Legacy option prices are not converted by Stage 2C but fractional SYP values
-- can still make a historical product unorderable under the approved policy.
SELECT count(*) FILTER (WHERE p."currency" IN ('SYP','ل.س')
                           AND o."priceDelta" <> trunc(o."priceDelta")) AS fractional_syp_legacy_options
FROM "ProductOption" o
JOIN "ProductOptionGroup" g ON g.id = o."groupId"
JOIN "Product" p ON p.id = g."productId";

COMMIT;
