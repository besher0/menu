# OrderSawa Product Configuration Network — Codex Handoff

Last updated: 2026-10-13

Current state: **Stage 6C test-only trusted Network Order persistence is complete in source, commit `3816efc`. The public Network Cart still cannot enter Checkout/WhatsApp or create real Orders. Stage 6C's protected loopback/disposable-only API revalidates and saves immutable test snapshots; it must never be exposed to Production. Final regression: 171/171 tests, no skips; Typecheck, Build, Prisma Validate and disposable Schema Diff passed. Read `STAGE_6C_TRUSTED_ORDERS_REPORT_AR.md` before further work. Stage 6D or any real activation needs separate explicit approval.**

This file is intentionally self-contained. A new Codex conversation should be able to continue without the previous chat history.

## 1. Repository and Git identity

- Authoritative source archive: `menu-main (1).zip`.
- Verified archive SHA-256: `7CE096B992F1A053B09F535138B87F8046EB17A56318E8E6B2ADF2DEFF3EF87A`.
- Working repository: the directory containing this file (`menu-main/`).
- Required branch: `feature/product-configuration-network`.
- Baseline commit: `f876c60 chore: capture verified menu-main baseline (sha256 7CE096B9)`.
- Baseline tag: `baseline-menu-main-archive`.
- Stage 1 commit: `698e8e8 feat(shared): add product configuration engine`.
- Stage 2C implementation commit: `6d92288 feat(api): finalize Stage 2C migration preparation`.
- Stage 2C handoff commit: `2c2f09d docs: add Stage 2C Codex handoff`.
- Stage 3 implementation/report commit: `5fe7b82 feat(api): complete Stage 3 product configuration integration`.
- Stage 3 handoff commit: `542f6e4 docs: update Codex handoff after Stage 3`.
- Stage 3.1 implementation/report commit: `2507720 fix(api): stabilize Stage 3 product configuration backend`.
- The commit titled `docs: update Codex handoff after Stage 3.1` contains this handoff revision.
- Stage 4 implementation/report/handoff commit: `feat(web): add Stage 4 product configuration editor` (use `git log -1 --oneline` for its hash).
- Stage 4.1 verification/fix/report/handoff commit: `test(web): verify Stage 4 dashboard editor` (use `git log -1 --oneline` for its hash after completion).
- Stage 5 implementation/report/handoff commit: `feat(public): add Stage 5 preview-only product configurator` (use `git log -1 --oneline` for its final hash).
- Stage 6A Server Quote commit: `55b5dc9 feat(api): add Stage 6A trusted server quote validation`.
- Stage 6B implementation commit: `4ec4c14 feat(web): integrate Stage 6B Network cart with server quote`.
- Stage 6B report/handoff commit follows implementation; use `git log -2 --oneline` for its hash.
- Stage 6C implementation commit: `3816efc feat(api): add Stage 6C test-only trusted Network orders`.
- Stage 6C report/handoff commit follows implementation; use `git log -2 --oneline` for its hash.

At the end of Stage 3.1, the expected state is a clean working tree on the branch above. Verify with:

```powershell
git branch --show-current
git status --short
git log --oneline -6
```

## 2. Authoritative source material

Do not rely only on this summary. Before a new stage, read the original files in full from:

`../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/`

Required priority order:

1. `AUTHORITATIVE_RULES/LATEST_FOUNDER_DECISION_LEDGER_V2_CURRENT.md`
2. `AUTHORITATIVE_RULES/CURRENT_SUPERSESSION_AND_CONFLICT_RULES.md`
3. `02_IMPLEMENTATION_WORKFLOW_AR.md`
4. `04_ACCEPTANCE_TEST_MATRIX.md`
5. `03_CODEX_PROMPTS.md` as workflow guidance only, subordinate to the current ledgers and the user's current request.

Current overrides supersede historical rules. If these files are missing or the repository identity differs, stop and ask the user before programming.

## 3. Stage status

### Stage 0 — Source audit

Completed.

- Inspected the real monorepo rather than creating a standalone project.
- Confirmed workspaces: `packages/shared`, `apps/api`, and `apps/web`.
- Identified existing legacy `ProductOptionGroup`/`ProductOption`, product CRUD, imports, public menu, cart/order paths, feature flags, tenant guard, and Prisma history gap.
- Established the verified Git baseline and branch.
- No product-network code was written during Stage 0.

### Stage 1 — Shared contracts and engine

Completed in commit `698e8e8`.

Primary location:

`packages/shared/src/product-configuration/`

Implemented:

- Versioned `ProductConfigurationV1`, selection, snapshot, dependency, pricing, and minimum-price contracts.
- `SIZE` and `OPTIONS` recursive groups.
- Full size prices, nullable Base, nested groups, option/group quantity bounds, included quantity, linked products, and combos.
- ORIGINAL and CUSTOM linked modes.
- Stable per-unit selection instances.
- Decimal-string/BigInt money implementation; no floating-point arithmetic in the engine.
- Structure validation, dependency discovery and cycle validation, selection validation, linked resolution, pricing, minimum price, and immutable snapshot logic.
- Engine safety limits for depth, node count, group choices, quantities, money digits/scale, selection instances, and minimum-price state search.

Stage 1 shared suite currently passes 21/21 tests.

### Stage 2A — Migration design

Completed as design/review work.

- Defined nullable `Product.basePrice` while preserving null versus zero.
- Designed persisted JSON `configurationTree`, integer `configurationVersion`, and dependency index.
- Designed idempotent/resumable/quarantine backfill from legacy option tables.
- Identified the missing initial migration/history risk.
- Produced migration, rollback, history-audit, and validation planning without touching a real database.

### Stage 2B — Disposable PostgreSQL validation

Completed on isolated PostgreSQL only.

- Applied a current baseline and proposed migration to disposable PostgreSQL.
- Validated null/zero/positive Base values, network JSON, linked FKs, tenant isolation, repeatable backfill, quarantine, rollback, and schema diff.
- Adopted `DECIMAL(24,6)` for internal storage.
- Currency-specific rounding policy remains unresolved and was not invented.

### Stage 2C — Migration implementation preparation

Completed and committed in `6d92288`, with handoff commit `2c2f09d`.

Implemented/prepared:

- Official Prisma schema changes (not deployed to any existing database).
- Official migration file:
  `apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql`.
- `Product.basePrice Decimal? @db.Decimal(24,6)`.
- `configurationTree Json?` and `configurationVersion Int`.
- `ProductConfigurationDependency` with composite tenant-safe FKs.
- Owner deletion cascades its edges; source deletion is restricted.
- DB checks for configuration envelope/version/base mirror and dependency edge invariants.
- Production-oriented backfill with batching, dry-run, execute confirmation, checkpoint/resume, idempotency, and quarantine.
- Serializable atomic persistence helper:
  `apps/api/src/modules/products/product-configuration.persistence.ts`.
- Guarded rollback SQL and read-only migration history audit SQL.
- Stage 2C runbook under `docs/`.

No Stage 2 migration or backfill has been run on an OrderSawa database.

### Stage 3 — Admin API and integration

Completed and committed in `5fe7b82`.

Full report:

`STAGE_3_ADMIN_API_IMPLEMENTATION_REPORT_AR.md`

Implemented:

- Admin GET/PUT product-configuration endpoints.
- DTO aligned with the Stage 1 contract.
- Shared-engine validation before persistence.
- Exact next revision rule (`revision === expectedVersion + 1`).
- Optimistic conflict mapping to HTTP 409.
- Prisma Serializable retry handling for `P2034` and safe `P2002` conflict mapping.
- Tenant-scoped owner and linked-source validation.
- Missing source, cross-restaurant source, self-link, direct/deep cycle protection.
- ORIGINAL requires a live persisted source configuration; CUSTOM retains a live dependency but carries its snapshot.
- Atomic tree/version/base/dependency-index update through the Stage 2C helper.
- Capability recheck inside the same transaction.
- Structural management permission.
- Soft/hard delete dependency protection and category dependency review.
- Legacy serialization/import/export/quick-price compatibility fixes.
- Stage 3 originally used `isAvailable=false` as temporary public-rollout protection; Stage 3.1 replaced that coupling with structural Legacy filters at the public boundaries.

No Dashboard UI, Public Menu, Cart, Checkout, migration history, schema migration, deployment, or production data was changed in Stage 3.

### Stage 3.1 - Backend Stabilization

Completed and committed in `2507720`.

Full report:

`STAGE_3_1_BACKEND_STABILIZATION_REPORT_AR.md`

Implemented:

- Preserved merchant-controlled `isAvailable` when saving or backfilling a Network Product.
- Added a single Legacy public-product predicate requiring both `configurationVersion = 0` and database-null `configurationTree` in public listing and WhatsApp ordering.
- Kept Legacy sources linkable through explicit CUSTOM snapshots without converting the source.
- Kept ORIGINAL tied to a live saved Network source and added structured 409 error `ORIGINAL_LINKED_SOURCE_REQUIRES_NETWORK_CONFIGURATION`.
- Added actual HTTP socket E2E coverage with real guards, controller, service, Prisma, JWTs generated at runtime, and disposable PostgreSQL.
- Made Category dependency scan plus soft-delete one Serializable Transaction, with concurrency conflict mapping.
- Audited all Product writers and added regression coverage for generic update/quick-price/configuration boundaries.
- Revalidated capability loss: stored tree and dependency data remain readable, writes are denied, and no Base Price fallback occurs.

Stage 3.1 deliberately did not change Prisma schema, migrations, the backfill algorithm, Dashboard UI, Cart, Checkout, Billing, or Business/Outlet architecture. Its limited `PublicMenuService` change is a deny-only legacy boundary, not a public configurator.

### Stage 4 - Dashboard Product Configuration Editor

Completed under the commit titled `feat(web): add Stage 4 product configuration editor`.

Full report:

`STAGE_4_DASHBOARD_EDITOR_REPORT_AR.md`

Implemented:

- Integrated the editor into the real existing Product edit form; new Product creation remains the current Legacy flow until a product ID exists.
- Added an RTL responsive recursive tree editor in `apps/web/src/components/dashboard/product-configuration/`.
- Supports independent SIZE groups with full prices, nullable Base, OPTIONS, group and option quantities, Included Quantity, size-specific overrides, nesting, availability, stable IDs, deletion confirmation, and sibling reordering.
- Uses only the approved configuration GET/PUT API for tree persistence and the existing tenant-scoped Product list for linked-source search.
- Handles exact next revision, structured 400 issues, 403 permission/capability loss, and 409 conflict while retaining the local draft.
- Added local-only draft autosave, explicit Save/Cancel, before-unload/link navigation protection, and an unsaved state indicator. No server autosave exists.
- Added Linked Product ORIGINAL/CUSTOM editing, live source structure display, local price overrides, explicit CUSTOM snapshot editing, Legacy-CUSTOM protection, unavailable-source warnings, and repeated source support.
- Added an interactive preview that calls the Stage 1 `calculatePrice` engine directly and never performs floating-point money arithmetic.
- Added local-only Demo fixtures for Pizza Margherita, Included Quantity, size-specific pricing, and Combo ORIGINAL/CUSTOM.
- Protected the old Product form from converting blank Base to zero and from updating Network Base through the generic Product PATCH route.

No Backend, Prisma, Migration, Public Menu, Cart, Checkout, deployment, Production data, package billing, or Business/Outlet architecture was changed in Stage 4.

### Stage 4.1 - Dashboard Functional Verification

Completed under the commit titled `test(web): verify Stage 4 dashboard editor`.

Full report:

`STAGE_4_1_DASHBOARD_VERIFICATION_REPORT_AR.md`

Verified:

- Started the real NestJS API and Next.js Dashboard against new isolated PostgreSQL 16 databases on loopback port `55440` without using project `.env` files.
- Re-ran the previously skipped disposable-PostgreSQL/API suite: 79/79 passed with zero skips.
- Used Browser Automation for login, Product list/edit navigation, Legacy form regression, persisted Network reload, RTL, a 390x844 viewport, recursive tree inspection, preview pricing, and screenshots displayed in the Codex session.
- Saved/reloaded a Pizza Network through the real GET/PUT API, updated revision 1 to 2, verified HTTP 409 for stale revision, full Size prices, null Base, nested options, size override pricing, and Included Quantity.
- Saved/reloaded a required Combo with repeated ORIGINAL source plus explicit Legacy CUSTOM snapshot.
- Verified real HTTP 403 for an EMPLOYEE write and for capability loss; stored tree/version remained intact and readable.
- Verified generic metadata updates do not remove Network configuration and generic Base mutation cannot bypass the configuration path.

Fixed one Stage 4 defect:

- Combo Demo source selection now prefers a Legacy product for CUSTOM even when a Network product appears first, while ORIGINAL still requires a saved Network tree. No source is auto-converted.

Stage 4.1 changed only Dashboard demo selection/tests and documentation. It did not change Backend, Prisma, migrations, Public Menu, Cart, Checkout, deployment, Production data, package billing, or Business/Outlet architecture.

### Stage 5 - Public Product Configurator

Completed in source. Full details: `STAGE_5_PUBLIC_CONFIGURATOR_REPORT_AR.md`.

- Added a public, tenant-scoped, read-only configuration API at `GET /public/menus/:restaurantSlug/products/:productId/configuration`.
- Public listing includes valid Network cards with decimal-string minimum price and `STARTING_AT`/`UNAVAILABLE` state only when `PRODUCT_CONFIGURATION` is assigned. The full response explicitly says `previewOnly: true` and `orderAction: STAGE_6_REQUIRED`.
- Public React configurator uses the existing Shared selection, validation, minimum-price, and pricing logic. It supports full Size prices, nested groups, quantities, Included Quantity, size overrides, ORIGINAL/CUSTOM, and stable independent repeated Linked Product selections.
- Saved preview selections live in `sessionStorage` keyed by restaurant, product, and configuration revision. No server-side order is created.
- Network products remain excluded from the legacy WhatsApp order query and from Public Menu cart controls. A Legacy product with `basePrice=null` is also blocked from the legacy order path; an explicit zero price remains valid.
- Added a guarded, idempotent development fixture command (`seed:stage5-public-demo`) for newly prepared local disposable Stage 2C databases only. It creates Pizza, Combo, Included Quantity, and a Legacy CUSTOM source under `stage5-demo`.
- Browser verification covered Pizza, Combo, repeated ORIGINAL units, CUSTOM, RTL, mobile 390×844, and Legacy compatibility. The single-choice replacement defect found in that run was fixed.
- No Prisma schema/migration, real database, Dashboard, Cart, Checkout, Billing, or deployment change occurred.

## 4. Current architectural decisions

### Canonical model

- `configurationTree` is the only canonical runtime configuration for Network products.
- Legacy `ProductOptionGroup` and `ProductOption` remain for compatibility/migration only; do not make them a parallel pricing source for Network products.
- A product is treated as `NETWORK` when it has a non-null tree and `configurationVersion > 0`; otherwise it is `LEGACY`.
- Do not delete legacy tables until a separately approved retirement stage.

### Money and pricing

- Money in shared contracts is canonical non-negative decimal text.
- Internal DB precision is `DECIMAL(24,6)`.
- `null` Base means no Base; explicit `"0"` means a real zero price.
- Any Size on a selected path replaces/ignores Base for that path.
- Size prices are full prices, never deltas.
- Included Quantity makes the highest-priced N parent option units free; child branch prices remain payable.
- Linked-product price is local to the parent configuration. Standalone source selling price is never inherited automatically.
- Currency-specific scale and rounding are still pending explicit approval.

### Structure and selection

- Node types are `SIZE` and `OPTIONS`.
- Options may nest recursively.
- A path cannot enter another Size group after a Size has been selected.
- `max=null` means no merchant max, but the platform safety cap still applies.
- Group counts are selected units, not distinct option IDs.
- Repeated units require distinct stable `instanceId` values.
- Minimums are never silently reduced when availability changes.

### Linked products

- Same-restaurant/catalog only in the current architecture.
- No Business Catalog + Outlet Differential layer has been implemented yet.
- ORIGINAL uses the latest live source structure/rules, with parent-local price overrides.
- CUSTOM stores a local subtree snapshot while source identity and orderability remain live.
- Source products in ORIGINAL mode must already have a persisted Network configuration.
- A Legacy source can be used in CUSTOM only with an explicit valid snapshot. No automatic Legacy-to-Network conversion occurs.
- Self-links and all direct/deep graph cycles are forbidden by the backend.
- Source deletion is blocked if any owner depends on it. Never silently detach or mutate the parent tree.
- Hide/availability is operational and is not structural removal.

### Capability and permissions

- Feature key: `PRODUCT_CONFIGURATION`.
- Permission: `product.configuration.manage`.
- OWNER, MANAGER, and EDITOR have the structural permission; EMPLOYEE does not.
- Authenticated reads are tenant-scoped and remain available after capability loss so data is not hidden/deleted.
- Writes and first activation require the assigned capability.
- Capability is checked before save and again inside the Serializable transaction.
- The current adapter reads the enabled feature from the restaurant's assigned plan and intentionally ignores subscription billing status.
- `PRODUCT_CONFIGURATION` was not automatically assigned to BASIC, PRO, or PREMIUM. Default commercial mapping requires an explicit product decision.
- Current schema does not model package versions, entitlement snapshots, market scope, or explicit entitlement exceptions. Do not pretend it does; extend only after approval.

### Public-ordering safety before Stage 5

- `isAvailable` remains a merchant-controlled operational field and is not changed by configuration save.
- Legacy public listing and WhatsApp ordering require `configurationVersion = 0` and `configurationTree IS NULL` in addition to the existing active/available/not-deleted checks.
- This structural boundary also protects backfilled Network Products whose `isAvailable` remains true.
- Quick price updates refuse configured products.
- Metadata updates cannot alter configured pricing outside the configuration endpoint.
- Stage 5 must add the approved public resolver/configurator behavior before Network Products become publicly orderable.

## 5. Stage 3 API contract

Controller base:

`/dashboard/products`

Guards:

- `JwtAuthGuard`
- `RestaurantContextGuard`

Endpoints:

1. `GET /dashboard/products/:id/configuration`
2. `PUT /dashboard/products/:id/configuration`

PUT body:

```json
{
  "expectedVersion": 0,
  "configuration": {
    "schemaVersion": 1,
    "productId": "product-id",
    "revision": 1,
    "basePrice": null,
    "groups": []
  }
}
```

GET and successful PUT include:

- `productId`
- `mode`
- `configurationVersion`
- `configurationTree`
- exact `basePrice` string or null
- `isAvailable`
- capability state
- `orderabilityState`

Error codes include:

- `PRODUCT_CONFIGURATION_VALIDATION_FAILED` — 400 with structured issues.
- `PRODUCT_CONFIGURATION_PERMISSION_DENIED` — 403.
- `FEATURE_LOCKED` — 403.
- `PRODUCT_CONFIGURATION_CONFLICT` - 409.
- `ORIGINAL_LINKED_SOURCE_REQUIRES_NETWORK_CONFIGURATION` - 409 with source IDs and the explicit CUSTOM alternative.
- `PRODUCT_CONFIGURATION_CONCURRENT_UPDATE` - 409.
- `PRODUCT_CONFIGURATION_DEPENDENCY_EXISTS` - 409.
- `CATEGORY_PRODUCT_CONFIGURATION_DEPENDENCY_EXISTS` - 409.
- `CATEGORY_DELETE_CONFLICT` - 409.
- `PRODUCT_CONFIGURATION_PRICE_MANAGED` - 409.

## 6. Important implementation files

### Shared engine

- `packages/shared/src/product-configuration/index.ts`
- `packages/shared/src/product-configuration/types.ts`
- `packages/shared/src/product-configuration/money.ts`
- `packages/shared/src/product-configuration/validation.ts`
- `packages/shared/src/product-configuration/dependencies.ts`
- `packages/shared/src/product-configuration/resolution.ts`
- `packages/shared/src/product-configuration/selection.ts`
- `packages/shared/src/product-configuration/pricing.ts`
- `packages/shared/src/product-configuration/minimum-price.ts`
- `packages/shared/src/product-configuration/snapshot.ts`
- `packages/shared/src/product-configuration/product-configuration.test.ts`

### Database and migration preparation

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261012000000_product_configuration_network/migration.sql`
- `apps/api/prisma/product-configuration-backfill.ts`
- `apps/api/prisma/backfill-product-configurations.ts`
- `apps/api/prisma/product-configuration-guarded-rollback.sql`
- `apps/api/prisma/product-configuration-history-audit.sql`
- `docs/product-configuration-stage2c-runbook.md`

### Stage 3 API

- `apps/api/src/modules/products/dto/update-product-configuration.dto.ts`
- `apps/api/src/modules/products/product-configuration.service.ts`
- `apps/api/src/modules/products/product-configuration.persistence.ts`
- `apps/api/src/modules/products/products.controller.ts`
- `apps/api/src/modules/products/products.service.ts`
- `apps/api/src/modules/products/products-import.service.ts`
- `apps/api/src/modules/feature-flags/feature-flags.service.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `packages/shared/src/feature-keys.ts`
- `packages/shared/src/roles.ts`

### Stage reports

- `STAGE_3_ADMIN_API_IMPLEMENTATION_REPORT_AR.md`
- `STAGE_3_1_BACKEND_STABILIZATION_REPORT_AR.md`
- `STAGE_4_DASHBOARD_EDITOR_REPORT_AR.md`
- `STAGE_4_1_DASHBOARD_VERIFICATION_REPORT_AR.md`

### Stage 3 and 3.1 tests

- `apps/api/src/modules/products/product-configuration.integration.spec.ts`
- `apps/api/src/modules/products/product-configuration.service.spec.ts`
- `apps/api/src/modules/products/product-configuration.persistence.spec.ts`
- `apps/api/src/modules/products/products.controller.spec.ts`
- `apps/api/src/modules/products/products.service.spec.ts`
- `apps/api/src/modules/feature-flags/feature-flags.service.spec.ts`
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts`

### Stage 4 Dashboard editor

- `apps/web/src/components/dashboard/product-configuration/product-configuration-editor.tsx`
- `apps/web/src/components/dashboard/product-configuration/configuration-workspace.tsx`
- `apps/web/src/components/dashboard/product-configuration/configuration-preview.tsx`
- `apps/web/src/components/dashboard/product-configuration/editor-model.ts`
- `apps/web/src/components/dashboard/product-configuration/api.ts`
- `apps/web/src/components/dashboard/product-configuration/demos.ts`
- `apps/web/src/components/dashboard/product-configuration/messages.ts`
- `apps/web/src/components/dashboard/product-configuration/types.ts`
- `apps/web/src/components/dashboard/product-configuration/editor-model.test.ts`
- `apps/web/src/components/dashboard/product-configuration/api.test.ts`
- `apps/web/src/components/dashboard/product-configuration/configuration-workspace.test.ts`
- `apps/web/vitest.config.mts`
- `apps/web/src/components/dashboard/product-form.tsx`
- `apps/web/src/app/globals.css`

### Stage 5 Public configurator

- `apps/api/src/modules/public-menu/public-product-configuration.ts`
- `apps/api/src/modules/public-menu/public-menu.controller.ts`
- `apps/api/src/modules/public-menu/public-menu.service.ts`
- `apps/api/prisma/seed-stage5-public-demo.ts`
- `apps/web/src/components/public/product-configurator.tsx`
- `apps/web/src/components/public/product-configurator-model.ts`
- `apps/web/src/components/public/product-configurator.module.css`
- `apps/web/src/components/public/public-menu-client.tsx`
- `apps/web/src/lib/api.ts`
- `STAGE_5_PUBLIC_CONFIGURATOR_REPORT_AR.md`

## 7. Final verified test state

Stage 5 final run on a new PostgreSQL 16 disposable cluster, bound to `127.0.0.1:55440`:

- Shared: 21/21 passed.
- API Unit, disposable DB Integration, and HTTP: 85/85 passed in 16 files; 0 skipped.
- Web Component/Model: 22/22 passed in 5 files.
- Total executed: 128/128 passed; 0 skipped.
- Root Typecheck and Root Build passed; Next.js generated 27/27 pages/routes.
- Prisma Validate passed; Schema Diff against disposable Stage 2C schema reported no difference.
- Guarded Demo seed ran twice without duplicate records and exposed three Network examples plus a Legacy source in disposable DB only.
- Browser verification passed for Pizza and Combo, pricing changes, stable repeated ORIGINAL units, CUSTOM, Legacy, RTL, and mobile without horizontal overflow. Screenshots were displayed in the Codex session but were not exported to files.
- No CLI Browser E2E runner is installed; browser work was interactive. The reproducible automated coverage is Shared, Web, API, HTTP, and disposable DB integration.
- Next.js, NestJS, and PostgreSQL were stopped; no listeners remained on ports 3000, 5000, or 55440. The disposable test cluster directory `../work/stage5-postgres-data` remains outside Git because workspace policy rejected its recursive removal. It contains only test fixtures; do not treat it as a real OrderSawa database.

The older Stage 3/4 verification history below is retained for provenance.

All final runs used the repository source and a workspace-local TEMP directory because the Windows sandbox denies Vitest access to the normal user Temp path.

- Shared Vitest: 21/21 passed.
- API unit + disposable PostgreSQL + HTTP E2E: 79/79 passed in 15 files.
- Total: 100/100 passed.
- Disposable PostgreSQL integration subset: 14/14 passed.
- Prisma validate: passed.
- Prisma schema diff against disposable Stage 2C schema: `This is an empty migration.`
- Product-configuration tools typecheck: passed.
- Root typecheck (Shared/API/Web): passed.
- Root build (Shared/API/Web): passed; Next.js generated 27 pages/routes successfully.

Stage 4 final verification added:

- Web Stage 4 Vitest: 13/13 passed in 3 files.
- Shared regression: 21/21 passed.
- API regression: 65 passed; 14 disposable-PostgreSQL integration tests skipped in this Stage 4 run because no disposable DB was created and Stage 4 does not change DB/API. Their last approved Stage 3.1 run remains 14/14 passed.
- Executed total in the Stage 4 final regression: 99 passed, 14 skipped.
- Root Typecheck: passed.
- Prisma validate: passed with local dummy validation-only URLs; no database connection was made.
- Root Build: passed; Next.js generated 27 routes/pages.
- Web visual coverage: recursive SSR component render plus responsive/RTL CSS and production build. No runtime screenshot was taken because no authenticated disposable Dashboard/API fixture was available, and Production/real `.env` use remained prohibited.

Stage 4.1 final verification supersedes the Stage 4-only skipped-test note above:

- Web Stage 4/4.1 Vitest: 14/14 passed in 3 files.
- Shared Vitest: 21/21 passed.
- API unit + disposable PostgreSQL + HTTP E2E: 79/79 passed in 15 files, including the former 14 skipped integration tests.
- Final total: 114/114 passed; 0 skipped.
- Root Typecheck: passed.
- Root Build: passed; Next.js generated 27/27 pages/routes.
- Prisma validate: passed.
- Prisma schema diff against the disposable schema: `This is an empty migration.`
- Browser verification: real login/navigation, Legacy form, persisted Network revision 2 reload, recursive Pizza tree, Shared-engine preview, RTL, 390x844 single-column layout, and inline screenshots.
- Functional API verification: Pizza create/update/reload, price 125 for Medium + Extra Cheese, Included Quantity total 115, required Combo with ORIGINAL/CUSTOM/repeated source, 409, 403, and capability-loss preservation.

Disposable DB details from the test run:

- PostgreSQL 16 runtime inherited from Stage 2B tooling.
- New cluster directory: `../work/stage3-postgres-data`.
- Bound only to `127.0.0.1:55440`.
- Database: `ordersawa_stage3_integration`.
- Full schema generated with Prisma diff from empty and applied as SQL with `psql`.
- No `db push`, `migrate deploy`, real `.env`, existing database, or existing volume was used.
- The disposable server was stopped after testing.

An extra all-test-source TypeScript command (`tsc -p apps/api/tsconfig.json --noEmit`) still reports a pre-existing, out-of-scope generic `Buffer` mismatch in `apps/api/src/modules/products/import/product-import-parser.spec.ts:23`. Official API/root typecheck, build, and all Vitest suites pass.

## 8. Unresolved risks and required decisions

1. **Migration history is still unaudited on any real OrderSawa database.** Do not deploy the Stage 2C migration until the read-only history audit is separately approved and completed.
2. **No initial migration exists in the repository.** Follow the Stage 2C runbook; never rewrite or guess production history.
3. **Backfill rollout safety is now enforced at legacy public boundaries:** converted products are excluded by tree/version markers without mutating `isAvailable`. Backfill still must not run on real data without separate approval, dry-run review, checkpoint/quarantine planning, and migration-history audit.
4. **Stage 6C test-only Order persistence exists; real ordering does not.** Network Cart remains preview-only and blocked from Legacy Checkout/WhatsApp. The new API requires a disposable local PostgreSQL target and explicit test flag, revalidates inside a Serializable transaction, and stores sealed snapshots. Never enable this test endpoint for public traffic. Stage 6D and the financial/operational blockers in the Stage 6C report remain.
5. **Capability model is an adapter.** Package version/snapshot/exception/market semantics need a future schema decision.
6. **Default package assignment is unresolved.** The capability exists but is not automatically mapped to BASIC/PRO/PREMIUM.
7. **Currency rounding policy is unresolved.** Keep decimal strings/`DECIMAL(24,6)`; do not introduce ad hoc rounding.
8. **External writers:** DB constraints enforce envelope/FK invariants, but semantic validation depends on the shared engine and atomic helper. New writers must use them.
9. **Legacy ORIGINAL prerequisite:** ORIGINAL cannot resolve a Legacy source that has no canonical Network tree. Use explicit CUSTOM snapshot or explicitly configure the source first; never auto-convert it.
10. **Business/Outlet differential architecture is not implemented.** Do not hard-code assumptions that make it impossible, but do not build it without approval.
11. **Test-source TypeScript cleanup:** the Product Import Buffer typing issue noted in section 7 is unrelated and deferred to a separate maintenance task.
12. **Runtime context:** Public API currently resolves at Restaurant scope; Outlet Differential, Service Mode, and Product Scheduling remain unimplemented and explicitly marked false in its response.
13. **Browser automation:** Stage 5 was verified interactively; no Playwright/Puppeteer runner is installed for repeatable CLI Browser E2E.

## 9. Mandatory database safety rules

- Never connect to Production or any existing database without separate explicit authorization.
- Never use the project's real `.env` for tests.
- Never run `prisma migrate deploy`, `prisma db push`, backfill, rollback, or `migrate resolve` on a real database without a new approval.
- Never rewrite old migration history.
- Never delete legacy option tables or real restaurant data.
- Never commit credentials, connection strings, logs, checkpoints, quarantine output, or operational data.
- Disposable DB names must be explicit and isolated; Stage 3 integration tests additionally reject non-loopback URLs, ports other than `55440`, and database names not beginning with `ordersawa_stage3_`.

## 10. How to continue in a new conversation

1. Read this file fully.
2. Read the authoritative source files listed in section 2 fully.
3. Verify branch, status, and commits.
4. Confirm Stage 1, Stage 2C, Stage 3, Stage 3.1, Stage 4, Stage 4.1, and Stage 5 files actually exist.
5. Read the Stage 3, Stage 3.1, and Stage 4 Arabic implementation reports.
6. Read `STAGE_4_1_DASHBOARD_VERIFICATION_REPORT_AR.md`, `STAGE_5_PUBLIC_CONFIGURATOR_REPORT_AR.md`, `STAGE_6A_SERVER_QUOTE_REPORT_AR.md`, `STAGE_6B_NETWORK_CART_REPORT_AR.md`, and `STAGE_6C_TRUSTED_ORDERS_REPORT_AR.md` before considering any further stage.
7. Re-run the baseline tests before a new stage if practical.
8. Do not rebuild completed engine, schema preparation, persistence, or Admin API without a documented defect.
9. Ask for explicit approval if the requested work would change an unresolved decision above.

Useful commands (with a workspace-local TEMP directory):

```powershell
npm run test:shared
npm run test:api
npm run test -w @menu/web
npm run typecheck
npm run build
npm run typecheck:product-configuration-tools -w @menu/api
npx prisma validate --schema apps/api/prisma/schema.prisma
```

The integration test command requires an explicitly created disposable database and environment variables supplied only for that command:

```powershell
npm run test:product-configuration:integration -w @menu/api
```

## 11. Next stage

The next proposed stage is **Stage 6D — network order presentation/WhatsApp and full-flow verification**, only after a new explicit approval and review of its exact authorized scope and Stage 6C blockers. Stages 6A, 6B, and test-only 6C are complete; real ordering and 6D are not. Do not infer a currency rounding policy from this handoff alone.

Do not begin Stage 6D, deployment, or any real migration automatically. Never expose Network Products through the Legacy order path. Stop and wait for explicit approval.

## 12. Stage 6A — Server-side Quote & Validation (historical stage record)

Read `STAGE_6A_SERVER_QUOTE_REPORT_AR.md` before any Stage 6B/C work. Stage 6A adds `POST /public/menus/:restaurantSlug/products/:productId/quote` as a read-only, no-store endpoint. It accepts only versioned `selection`, rejects client prices/totals at all depths, reloads the current Restaurant-scoped catalog and Package Capability, and calls the existing Shared Engine for validity and decimal-safe price. It returns `canonicalSelection`, `selectionKey`, `priceBreakdown`, `trustedTotal`, `linkedSourceRevisions`, and explicit `configurationOrderable:true` alongside unchanged Stage 5 `previewOnly:true` and `orderAction:"STAGE_6_REQUIRED"`, plus `orderingEnabled:false`. The quote is current at response time only; Stage 6C must recompute before saving an order. No Cart, Checkout, WhatsApp, Order Snapshot, schema, or migration was changed.

Changed files: `apps/api/src/modules/public-menu/public-product-quote.ts`, its `.spec.ts`, `public-menu.controller.ts`, `public-menu.service.ts`, `apps/api/src/modules/products/product-configuration.integration.spec.ts`, the Stage 6A report, and this handoff. The Stage 6A work is committed independently on `feature/product-configuration-network` after Stage 5 commit `1a97529` (check `git log` for the exact latest hash).

Final tests on a **new** disposable PostgreSQL 16 cluster `../work/stage6a-postgres-data`, database `ordersawa_stage3_stage6a`, loopback port `55440`: Shared 21/21; API 96/96 including 21/21 DB/HTTP integration and 0 skipped; Web 22/22; total 139/139; root Typecheck and Build passed, 27/27 Next.js routes generated. The cluster was stopped after tests. The cluster directory remains outside Git and contains only test data. No real `.env`, database, migration, backfill, or deployment was used.

Carry-forward limits: currency rounding policy remains unapproved; the quote is not a price hold or checkout authority, Catalog and Capability reads are not one transactional snapshot, and Stage 6C must revalidate against current data and safely handle changes. Business/Outlet Differential, Service Mode, and Product Scheduling are not implemented. The Stage 2C migration history has not been audited against any real database.

## 13. Stage 6B — Network Cart Integration (latest)

Read `STAGE_6B_NETWORK_CART_REPORT_AR.md` for the full file list, Cart Identity contract, test evidence, safe Demo instructions, and risks. Implementation commit `4ec4c14` integrates the existing Stage 5 configurator and Stage 6A Quote with the existing Public Cart. `apps/web/src/components/public/cart-model.ts` defines `LEGACY | NETWORK` lines, semantic identity using `selectionKey` plus Restaurant/Product/Currency/Revision/linked-source versions/runtime context, version-2 local storage with safe Legacy-array migration, explicit recheck/changed-price acceptance, and a Checkout gate. The UI preserves independent Nested/Linked selections and supports add/edit/quantity/remove/reload; recheck runs on Cart entry. Server Quote errors leave lines invalid or offline, never trusted from storage. Out-of-order Quote responses cannot replace newer selections or line checks. Network and mixed carts do not reach Checkout/WhatsApp; a saved Legacy line whose product became Network is kept but also blocked pending explicit re-add.

Stage 6B final tests: Shared 21/21, API 96/96 including disposable-PostgreSQL HTTP integration with 0 skips, Web 35/35, total 152/152; root Typecheck and Build passed (27/27 Next.js routes). A fresh Stage 6B cluster `../work/stage6b-postgres-data` used `127.0.0.1:55440` and database `ordersawa_stage3_stage6b`; it was stopped. No real `.env`, database, migration, backfill, deployment, or Browser E2E was used. The public Quote already has a 256-kb default request limit, parser depth/node limits, and a shared POST rate policy; its full-Catalog read and globally-IP-scoped limit need load/security review before launch. Currency rounding remains undecided. Stage 6C must never treat Cart Local Storage or a prior Quote as order authority; it must reload and price atomically against current data.

Historical Stage 6B stop point: Stage 6C was subsequently approved and implemented. Await explicit approval before Stage 6D or any real database action.

## 14. Stage 6C — Trusted Order Creation & Immutable Snapshots (latest)

Read `STAGE_6C_TRUSTED_ORDERS_REPORT_AR.md` for the full API contract, file list, transaction/locking rationale, local disposable setup, test evidence, remaining blockers, and Stage 6D prerequisites. Implementation commit `3816efc` adds test-only `POST /public/menus/:restaurantSlug/orders/network-test/prepare` and `POST /public/menus/:restaurantSlug/orders/network-test`. Neither is connected to the public Cart. Service and HTTP guard require `NODE_ENV !== production`, `ENABLE_DISPOSABLE_NETWORK_ORDERS=1`, a loopback HTTP peer, and an actual PostgreSQL database named `ordersawa_stage3_stage6c_*` on `127.0.0.1:55440`. Do not remove these gates or reuse the endpoint for real orders without a separate security/architecture review.

The service reuses Stage 6A Quote and Shared Engine inside a Prisma Serializable transaction, locks Restaurant/Capability/Product rows, recalculates Decimal-string prices and amounts, checks current configuration and Linked sources, binds explicit acceptance to a signed exact Draft, then creates a `VALIDATED_TEST` Order and sealed immutable Snapshot. Database uniqueness enforces restaurant-scoped idempotency and single use of the acceptance token. SQL Triggers protect Network test Order/OrderItem historical evidence from later updates/deletion. Existing `DECIMAL(24,6)` Order money columns are unchanged; no rounding policy was invented. The new migration is additive, applies only to disposable test databases so far, and does not rewrite Stage 2C history.

Final Stage 6C verification used a fresh PostgreSQL 16 disposable cluster at `../work/stage6c-postgres-data`, `127.0.0.1:55440`, with separate `ordersawa_stage3_stage6c_orders_v3` and `ordersawa_stage3_stage6c_regression_v3` databases. Baseline test SQL plus final Stage 6C Migration were applied there only. Shared 21/21, API 115/115, Web 35/35 (171/171 total; 0 skipped), Typecheck, Build (27/27 Next.js routes), Prisma Validate, and Schema Diff (no difference) passed. The cluster was stopped after testing. No real `.env`, existing database, production migration, backfill, deployment, or Browser E2E was used.

Carry-forward blockers: real migration history unaudited; no approved currency rounding policy; current HMAC acceptance key is per-process, unsuitable for multi-instance activation; the test-only endpoint has no production authentication/rate policy; public Cart remains gated; Stage 6D WhatsApp formatting must derive solely from the sealed Snapshot and needs browser E2E. Business/Outlet Differential, Service Mode/Scheduling, quote/catalog scalability, and old Dashboard Decimal-to-Number display remain separate work. Do not begin Stage 6D or real Network ordering without explicit user approval.
