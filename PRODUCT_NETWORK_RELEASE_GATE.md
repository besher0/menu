# Product Network — Release Gate & Laptop Handoff

Status: **NOT APPROVED FOR PRODUCTION**. This document describes evidence required before promotion. Do not apply migrations to the live Neon database from this branch.

## Completed remotely
- Kept all changes on `refactor/product-network-production-hardening`; no merge into `main`.
- Ported Analytics dedupe migration and Prisma schema fields from `main`.
- Made menu GET read-only for analytics; added client-side MENU_VIEWED tracking with database-backed deduplication.
- Added independent analytics and public WhatsApp checkout rate-limit policies (in-memory, per process).
- Reduced repeated per-line product lookup in disposable Network order draft.
- Added analytics regression tests.
- Added GitHub Actions for schema validation, disposable PostgreSQL 16 migration deployment/status, typechecking, tests, and builds.

## Must pass automatically on GitHub
1. Prisma validate and generate with both DATABASE_URL and DIRECT_URL configured.
2. Every migration applies cleanly to a disposable PostgreSQL 16 instance and `prisma migrate status` reports no pending migrations.
3. Shared, API and Web tests pass; API and Web TypeScript typechecks pass.
4. Production build succeeds. Inspect the full workflow logs; a committed workflow alone is not proof.
5. Review any test that skips because it requires a dedicated Stage 6C database; do not interpret skipped tests as passes.

## Laptop / staging checklist (do not run against production first)
1. Create a fresh, **isolated** Neon/PostgreSQL staging branch or restore a sanitized backup to a disposable DB. Confirm the connection points to staging, not production.
2. Back up and **restore-test** the database. Keep the original dump and record the restoration outcome.
3. Compare `prisma migrate status`, `prisma migrate diff`, indexes, constraints, and actual schema against expected Prisma models. Verify both `20261012000000_product_configuration_network`, `20261013000000_network_order_test_snapshot` and `20261026000000_add_analytics_dedupe_fields` in sequence.
4. Run migration deploy on staging, test rollback/recovery via restore, then inspect legacy prices, legacy options, subscriptions, analytics and active menu data.
5. Test multiple restaurants (cross-tenant reads/writes), permissions, stale configuration revisions, forged quote prices, replayed idempotency keys, mixed/legacy/network carts, concurrent checkout and duplicate analytics.
6. Benchmark cold/warm public menu fetches, product quote, checkout and lock contention with representative catalog sizes and concurrency. Compare Neon compute, query counts and P95/P99 latency to pre-change baseline.
7. Confirm HTTPS, proxy trust configuration, per-IP rate limits, CDN cache invalidation and no sensitive responses cached. Current rate limiting is process-local, **not distributed** across PM2 instances.
8. Verify responsive layout, Arabic RTL, loading/error/empty states, image quality, keyboard and screen-reader navigation, touch usability and 3G/4G behavior on actual phones.
9. Validate `PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY` is a strong production secret, and that Network test-only signing is never enabled in production.
10. Deploy first to staging behind a feature flag, rehearse monitoring/alerts and rollback. Only then request separate approval to merge into `main` or deploy.

## Known architectural / performance debt
- `NetworkOrdersService.lockCatalog` locks every Product in the restaurant, potentially causing contention. It is currently used in disposable test-only order persistence. Do **not** remove those locks without an equivalent consistency strategy and concurrent PostgreSQL tests.
- Public menu service and trusted WhatsApp checkout service are large and should be split by responsibility in behavior-preserving increments.
- Analytics and checkout rate limiting use an in-memory Map; multi-instance deployments need a shared store (e.g. Redis) and explicit proxy IP trust policy.
- 60-second menu caching must be reconciled with product availability/price updates and invalidation before enabling broadly.
- WhatsApp prepare/confirm is not equivalent to persisted production Network orders. Keep production activation gated until end-to-end acceptance is complete.

## Release decision
**NO-GO** until CI is green, staging migration + restore rehearsal succeeds, and the security/performance/UX acceptance matrix is signed off.
