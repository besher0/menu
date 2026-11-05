# Product Network — Release Gate & Laptop Handoff

Status: **NOT APPROVED FOR PRODUCTION**. This document describes evidence required before promotion. Do not apply migrations to the live Neon database from this branch.

## Completed remotely
- Kept all changes on `refactor/product-network-production-hardening`; no merge into `main`.
- Ported Analytics dedupe migration and Prisma schema fields from `main`.
- Made menu GET read-only for analytics; added client-side MENU_VIEWED tracking with database-backed deduplication.
- Added independent analytics and public WhatsApp checkout rate-limit policies (in-memory, per process).
- Reduced repeated per-line product lookup in disposable Network order draft.
- Added analytics regression tests.
- Added GitHub Actions for schema validation, disposable PostgreSQL 16 schema push validation, typechecking, tests, and builds.

## Must pass automatically on GitHub
1. Prisma validate and generate with both DATABASE_URL and DIRECT_URL configured.
2. Current Prisma schema pushes successfully to disposable PostgreSQL 16. **Migration replay is NOT verified**: the first checked-in migration references an existing `Category` table, so a pristine database lacks the required historical baseline. Rehearse migrations against a restored baseline before release.
3. Shared, API and Web tests pass; API and Web TypeScript typechecks pass.
4. Production build succeeds. Inspect the full workflow logs; a committed workflow alone is not proof.
5. Review any test that skips because it requires a dedicated Stage 6C database; do not interpret skipped tests as passes.

## Confirmed CI finding (2026-11-03)
- GitHub Actions run 41691934030: Prisma validation and client generation passed; `prisma migrate deploy` on an empty PostgreSQL 16 database failed with P3018 / SQLSTATE 42P01 (`Category` does not exist). This is a **real incomplete migration baseline**, not a missing CI environment variable. The CI now checks `prisma db push` against a disposable DB instead. Do not interpret this as migration-deploy approval.

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


## 2026-11-04 — Disposable PostgreSQL integration blocker

The new CI PostgreSQL 16 job now connects to its disposable database, and the
standard validation/build job passes. The real Stage 6C HTTP suite still fails
(17 failures / 3 passes) with HTTP 503 `NETWORK_ORDER_DB_GUARD_UNAVAILABLE`.
This is a **fail-closed safety guard**, not evidence that concurrency is correct.

Root cause: `prisma db push` creates the current Prisma schema but does **not**
install the database-side Stage 6C immutable snapshot triggers or the separately
reviewed Stage 6D.3C3E deferred completeness trigger/function candidate.
`assertNetworkOrderCompletenessGuard` checks PostgreSQL 16, the exact
trigger/function fingerprints, six older snapshot triggers, and the isolated
database identity. Merely changing the expected HTTP status, bypassing the
guard, or pretending that `db push` installs SQL triggers would invalidate the
integration test.

**Required before enabling this suite as a passing release gate:**
1. Build a *fresh, disposable* PostgreSQL 16 fixture with the original baseline,
   the Stage 6C trigger definitions, and the exact reviewed Stage 6D.3C3E
   candidate SQL; never run candidate SQL against Neon/production.
2. Preserve the script's database-name, loopback-address, port, empty-order,
   and fingerprint checks. CI container port mapping must be reconciled
   without broadening the production allowance.
3. Run the full HTTP suite, including concurrent updates and duplicate
   submissions, and capture the outcome; only then consider reducing
   `lockCatalog` locks.
4. Keep the migration-replay check on a restored staging baseline as a separate
   release gate. A clean `db push` is not migration validation.

Current CI failure is intentional evidence that a required database guard is
missing; production ordering remains disabled.

## 2026-11-05 — Disposable Neon PostgreSQL 18.6 verification

The isolated Neon test database was explicitly provisioned via Prisma schema push and
test-only SQL fixtures (Stage 6C six snapshot triggers plus Stage 6D completeness
trigger). The verified SQL trigger/function SHA-256 fingerprints were pinned in the
test-only guard with distinct PostgreSQL 16 and Neon 18.6 paths. Production test
ordering remains disabled; no migration was applied to the live database.

**User-run Windows/Neon evidence:**
- `src/modules/orders/network-orders.integration.spec.ts`: **20 passed / 0 failed**.
  Includes persistence, immutable snapshots, pricing precision, concurrent
  catalog changes, failed insert rollback and legacy WhatsApp compatibility.
- `src/modules/orders/network-order-db-guard.spec.ts`: **7 passed / 0 failed**.
- `npm run build`: shared, API and Next.js Web builds passed, including
  27 generated static pages. Next.js emitted a non-blocking workspace-root warning.

**Remaining release blockers:** Migration history is still incomplete on pristine
databases; a `prisma db push` plus test-only fixture is NOT a successful
`prisma migrate deploy`. Other integration suites use dedicated loopback-only
database URLs and cannot be counted as passing on Neon. In particular, the
Product Configuration suite performs broad `deleteMany` cleanup at setup and
must never be pointed at a populated/live database. Create separate, explicitly
verified disposable branches/fixtures for additional suites. Do not remove
identity checks, merge this feature branch or deploy it based on the 20+7 result.

## 2026-11-05 — Product Configuration Stage 3: isolated Neon-schema test harness

**Implementation complete; actual Neon Stage 3 tests NOT YET RUN.** To keep the
already-tested Network Orders `public` schema separate, the Product Configuration
suite now accepts an exact second schema `ordersawa_product_config_e2e` on the
previously verified disposable Neon PG18.6 endpoint. This is schema-level
isolation inside a *disposable* Neon database, **not** a second Neon branch or
a production deployment.

The fixture `scripts/product-configuration-neon-e2e-schema.sql` creates a
dedicated schema with a fixed marker comment and does not alter `public`
tables. The PowerShell script
`scripts/prepare-product-configuration-neon-e2e.ps1` checks the two exact
approved Neon hostnames, database, role, SSL parameters, and scopes Prisma
`db push` to the new schema. It preserves the original process
`DATABASE_URL` and `DIRECT_URL`, and sets only the dedicated Stage 3 test
URL for the next invocation in the **same** PowerShell session.

The Stage 3 integration suite independently verifies the live database/user,
PG version, exact schema marker, table count and a search path without public
fallback **before** broad `deleteMany` test setup. Old disposable PG16
loopback test support remains. Remote tests have larger Vitest timeouts.

### Local verification steps (on the disposable Neon branch only)

From repository root in the **same** PowerShell window:

```powershell
git fetch origin refactor/product-network-production-hardening
git merge --ff-only FETCH_HEAD
.\scripts\prepare-product-configuration-neon-e2e.ps1
npm run typecheck -w @menu/api
npm run test -w @menu/api -- src/modules/products/product-configuration.integration.spec.ts
```

If script execution is blocked by policy, first allow local script execution
for the current PowerShell process only. The DB tests remain unverified until
the operator runs them and records outcomes. Do not run them with a production
connection or against the `public` schema.

**Read-only preflight failure observed 2026-11-05:** Schema creation and
`prisma db push` completed in the isolated test schema, but the integration
suite's runtime SQL reported `current_schema() = public` on a pooled Neon
connection. All 24 tests were skipped by the fail-closed guard; no test data
was deleted. The suite therefore requires the **exact direct (unpooled) Neon
endpoint** and explicit PostgreSQL connection startup
`options=-c%20search_path%3Dordersawa_product_config_e2e`, in addition to
`schema=ordersawa_product_config_e2e`. Setup now selects the verified
`DIRECT_URL` instead of the pooled `DATABASE_URL` for the test runtime.
The guard also proves the actual Prisma model query routes to the isolated
schema using a temporary, explicitly schema-qualified canary *after* SQL
identity checks and *before* broad fixture deletion. Even a raw SQL
`current_schema()` result alone is insufficient to establish ORM routing.
After pulling this change the PowerShell setup script **must be rerun in the
same session** to set the corrected test environment variable. Actual 24-test
results remain pending.

**Follow-up on 2026-11-05:** The local `DIRECT_URL` was itself set to the
pinned `-pooler` endpoint. The strict runtime setup rejected it before any
destructive test. The script now safely rewrites only that one exact verified
disposable test compute's `-pooler` hostname into its matching direct hostname
**in memory**, leaves `.env` unchanged, and retains the strict direct-only
test URL checks and marked-schema/Prisma canary verification. If the input
host is anything else, setup still fails. Re-run the setup after pulling.
No additional integration test passes are claimed yet.

**Still no-go:** migration baseline / fresh `prisma migrate deploy` are not
fixed by `db push` in a test schema; other isolated integration suites and
production gates remain outstanding.

## 2026-11-05 — Product Configuration first live Neon run

The direct Neon connection and explicitly marked isolated schema passed
SQL identity checks and the Prisma ORM routing canary. All setup proceeded
against the dedicated disposable `ordersawa_product_config_e2e` schema.

Windows Vitest outcome: **23 passed / 1 timed out (24 total)**.
The failing scenario is the comprehensive setup-to-publish network lifecycle,
which issues many sequential real HTTP requests plus database writes. The
only failure reported was the exact **60,000 ms Vitest timeout**, without an
assertion mismatch. This is NOT yet evidence that all its steps are correct.

The next candidate test change gives only this one Neon scenario a
180,000 ms test budget and emits elapsed-time checkpoints for preflight,
creation, isolation, and completed lifecycle. The other tests retain their
existing timeouts. The scope is restricted to the existing disposable
Neon test URL. Re-run the filtered first test to confirm actual result
before claiming 24/24; no production activation or merge is authorized.

## 2026-11-05 — Product Configuration remaining E2E verified in isolation

The first and longest Product Configuration Stage 3 end-to-end scenario now
**passes when filtered** against the explicitly marked Neon PostgreSQL 18.6
test schema. It completed in **53,968 ms**. The four elapsed-time checkpoints
were approximately 3.4 s (permissions/capability), 9.9 s (hidden setup
created), 34.1 s (legacy/public isolation), and 54.0 s (configuration
lifecycle complete). Vitest reported **1 passed / 23 skipped**, by design
when run with the `-t` filter. The prior unfiltered attempt produced
**23 passed / 1 timed out** at the former 60-second budget.

Together these results confirm each of the 24 scenarios has passed in at least
one run, but **a complete unfiltered 24/24 run remains to be verified**. Next:

```powershell
npm run test -w @menu/api -- src/modules/products/product-configuration.integration.spec.ts
```

Do not describe the full suite as green until its combined run completes.


## 2026-11-05 — WhatsApp Checkout Stage 6E.2 isolated Neon fixture

The user ran the complete **Product Configuration Stage 3** suite on the
marked, direct-only disposable Neon schema: **24 passed / 0 failed** (24 total),
Vitest duration **79.66 s**; the complete setup-to-publish scenario took
**25.232 s**. This supersedes the earlier filtered run and 23/24 attempt.

**WhatsApp Stage 6E.2 preparation is implemented but not yet executed.**
The next test suite uses a different schema:
`ordersawa_whatsapp_checkout_e2e`. Do not reuse the Product Configuration
or Network Orders schema. Its new fixture scripts are:

- `scripts/whatsapp-checkout-neon-e2e-schema.sql` — creates only the marked
  checkout schema; checks disposable Neon PG18 DB/user identity.
- `scripts/whatsapp-checkout-neon-e2e-constraints.sql` — installs the five
  reviewed Product CHECK constraints from the historical migration into that
  schema *only*, since `prisma db push` does not install them.
- `scripts/prepare-whatsapp-checkout-neon-e2e.ps1` — checks the same two
  pinned Neon hosts, restores `DATABASE_URL` and `DIRECT_URL` on exit,
  scopes `prisma db push` and the CHECK setup to the dedicated test schema,
  and exports a **direct-only** runtime URL with a pinned startup search_path
  in the same PowerShell process.

The WhatsApp HTTP integration preflight now requires the exact direct-host,
opt-in flags, PG18.6/version, marker and 34 model tables, verifies generated
Prisma model queries use the dedicated schema with an explicitly qualified
temporary restaurant canary, and checks all five validated Product CHECK
constraints **in that schema** before any broad test cleanup. Loopback-only
PostgreSQL test URLs remain supported.

**User commands, from the repository root and same PowerShell session, only
if the current .env is the previously verified disposable Neon instance:**

```powershell
git -c http.version=HTTP/1.1 fetch origin refactor/product-network-production-hardening
git merge --ff-only FETCH_HEAD
.\scripts\prepare-whatsapp-checkout-neon-e2e.ps1
npm run typecheck -w @menu/api
npm run test -w @menu/api -- src/modules/public-menu/public-whatsapp-checkout.integration.spec.ts
```

No WhatsApp integration result should be claimed until the user runs it.
No merge to main, production deployment, or `prisma migrate deploy` approval
is granted; the historical migration baseline remains a blocker.
