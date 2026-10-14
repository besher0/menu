# OrderSawa Product Configuration Network — Codex Handoff

Last updated: 2026-10-14

Current state: **Stage 6E.1A closes the Stage 6E.1 provisional-Legacy-price gap in current source. Read `STAGE_6E_1A_NETWORK_SETUP_ACTIVATION_GUARD_REPORT_AR.md` and section 30 below. New `NETWORK_SETUP` Products are inserted atomically with a real V1 Tree at revision 1, null Base and no groups, hidden and unorderable; no provisional price exists. The Dashboard first save uses expectedVersion 1/revision 2. Premature activation returns 409, and Public/Legacy/Linked boundaries fail closed. Historical Stage 6E.1 Legacy shells, if any exist outside disposable tests, cannot be identified or converted without a separately authorized audit. Stage 6D.3C3F Design A remains isolated `NETWORK_TEST` with `orderingEnabled:false`; no Production database, operational migration, deployment, real Network Ordering, or WhatsApp send occurred. Stop after Stage 6E.1A and await explicit approval.**

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
- Stage 6D.1 formatter implementation commit: `3ec08c8 feat(api): format Stage 6C Network order snapshots for WhatsApp preview`.
- Stage 6D.1 report/handoff commit follows implementation; check `git log -2 --oneline` for its hash.
- Stage 6D.2A implementation commit: `ce0e192 feat(api): preserve network order details in sealed WhatsApp preview`.
- Stage 6D.2A report/handoff commit follows implementation; check `git log -2 --oneline` for its hash.
- Stage 6D.3B audit commit: `1bdc92d audit: document Stage 6D.3B network readiness findings`.
- Stage 6D.3C1 implementation/report/handoff commit: `fix(api): stabilize Public Menu all category creation` (run `git log -1 --format=%H` for the final hash).
- Stage 6D.3C2 implementation/report/handoff commit: `fix(api): map exhausted Network Prepare conflicts to 409` (run `git log -1 --format=%H` for its final hash).
- Stage 6D.3C3 benchmark/report/handoff commit: `6fff6a5 benchmark(network): measure catalog scaling and concurrency`.
- Stage 6D.3C3B diagnostics/report/handoff commit: check `git log -1 --oneline` after handoff; no Product runtime changes.
- Stage 6D.3C3C PoC/report/handoff commit: check `git log -1 --oneline` after handoff; no Product runtime/schema changes.
- Stage 6D.3C3D safe-design PoC/report/handoff commit: check `git log -1 --oneline` after handoff; no Product runtime/schema changes.
- Stage 6D.3C3E DB completeness candidate/report/handoff commit: check `git log -1 --oneline` after handoff; no Product runtime/schema/history changes.

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
4. **Stage 6D.1 formats immutable test-order snapshots; real ordering does not.** Network Cart remains preview-only and blocked from Legacy Checkout/WhatsApp. Stage 6C API remains disposable-only. New Formatter reads only stored `Order.cartSnapshot`, with no live Product lookup, and local preview sends nothing. Stage 6D.2/6D.3 and financial/operational blockers remain.
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
6. Read `STAGE_4_1_DASHBOARD_VERIFICATION_REPORT_AR.md`, `STAGE_5_PUBLIC_CONFIGURATOR_REPORT_AR.md`, `STAGE_6A_SERVER_QUOTE_REPORT_AR.md`, `STAGE_6B_NETWORK_CART_REPORT_AR.md`, `STAGE_6C_TRUSTED_ORDERS_REPORT_AR.md`, `STAGE_6D_1_WHATSAPP_FORMATTER_REPORT_AR.md`, `STAGE_6D_2A_ORDER_DETAILS_REPORT_AR.md`, `STAGE_6D_2B_NETWORK_ORDER_FLOW_REPORT_AR.md`, and `STAGE_6D_3A_BROWSER_QA_REPORT_AR.md` before considering any further stage.
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

Stage 6D.3C2 is complete as a **limited Prepare HTTP conflict fix only**. Read section 21 and its report. Do not begin Stage 6D.3C3 or another Stage 6D.3B follow-up without explicit approval. Do not activate real ordering, deploy, or run any real migration automatically. Do not infer a currency rounding policy from this handoff alone. Never expose Network Products through the Legacy order path. Stop and wait for explicit approval.

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

Carry-forward blockers: real migration history unaudited; no approved currency rounding policy; current HMAC acceptance key is per-process, unsuitable for multi-instance activation; the test-only endpoint has no production authentication/rate policy; public Cart remains gated; Stage 6D WhatsApp formatting must derive solely from the sealed Snapshot and needs browser E2E. Business/Outlet Differential, Service Mode/Scheduling, quote/catalog scalability, and old Dashboard Decimal-to-Number display remain separate work. Historical Stage 6C stop point: Stage 6D.1 was subsequently approved and completed; do not begin 6D.2/6D.3 or real Network ordering without explicit user approval.

## 15. Stage 6D.1 — WhatsApp Order Message Formatter (latest)

Read `STAGE_6D_1_WHATSAPP_FORMATTER_REPORT_AR.md` for the contract, examples, file list, preview commands, test evidence, and remaining blockers. Commit `3ec08c8` adds `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts`, a pure formatter of Stage 6C `Order.cartSnapshot` only. It renders historical Product/Size/Option/Linked names, independent ORIGINAL/CUSTOM instances, Included/Free/Paid charges, nested groups, quantity and exact decimal strings; it never queries a live catalog or sends a message. It throws structured errors for incomplete/malformed snapshots and unsafe display text, never silently truncates. `buildNetworkWhatsappPreviewUrl` URL-encodes complete text and refuses a locally oversized URL rather than cutting it. The separate CLI `npm run preview:network-whatsapp -w @menu/api -- pizza|combo ar|en` prints in-memory demo messages; `snapshot path-to-local-cartSnapshot.json` previews a saved test snapshot without DB access. Legacy WhatsApp formatter and ordering flow are unchanged.

Stage 6D.1 final checks: Shared 21/21, API 126/126 including 11 formatter tests and real disposable-PostgreSQL persisted Pizza/Combo Snapshot integration, Web 35/35, total 182/182 with 0 skips; root Typecheck and Build passed, Next.js 27/27 routes. A new isolated cluster `../work/stage6d1-postgres-data` ran only on `127.0.0.1:55440` with two `ordersawa_stage3_stage6c_formatter*` test databases containing Baseline SQL plus Stage 6C Migration; it was stopped after tests. No Production DB, real `.env`, deployment, message send, new migration, or order-persistence change was used.

Stage 6D.2 prerequisites: Stage 6C snapshot carries one historical label per node, not a full translation bundle; formatter cannot invent another language. It also lacks production order number/customer/fulfillment/address/note data. Long WhatsApp URL behavior needs UX decision; the local cap is not an external guarantee. The 6C currency rounding, multi-instance acceptance key, production endpoint security, migration-history audit, and Business/Outlet/Scheduling constraints remain. `orderingEnabled:false` is still mandatory. Do not start 6D.2/6D.3 or activate Network ordering without explicit approval.

## 16. Stage 6D.2A - Order Details & WhatsApp Message UX (latest)

Read `STAGE_6D_2A_ORDER_DETAILS_REPORT_AR.md` for the full field-reference table, Snapshot contract, actual persisted Pizza/Combo message examples, test evidence, and deferred decisions. Implementation commit `ce0e192` changes only `apps/api/src/modules/orders/`: `network-order-contract.ts`/spec, `network-orders.service.ts`/integration spec, `network-order-whatsapp-formatter.ts`/spec, and demo fixtures. The report and this handoff are in a separate documentation commit. No Schema or Migration was added.

The test-only Stage 6C prepare/create payload now accepts optional Legacy-compatible `customerName`, `customerPhone`, `fulfillmentType`, delivery address parts, `pickupTime`, `orderNote`, and per-item `note`. The Legacy public UI requires all three address parts when delivery is selected, although the Legacy backend DTO is looser; this test-only contract follows the UI condition. The signed Draft includes canonical details, so changes after prepare require a new acceptance. The same Serializable transaction captures trusted `restaurantName`, saves `orderDetails` in the sealed `Order.cartSnapshot`, and populates existing Order customer and OrderItem note columns. The formatter reads only the Snapshot, keeps old Snapshots without `orderDetails` compatible, shows human-facing Combo instances without displaying the technical ORIGINAL/CUSTOM modes, and refuses malformed new details. Database immutability triggers remain active. All amounts remain exact Decimal strings; no rounding or ordering activation was introduced.

Final Stage 6D.2A tests on a fresh disposable PostgreSQL 16 cluster `../work/stage6d2a-postgres-data`, port `127.0.0.1:55440`, with two new `ordersawa_stage3_stage6c_stage6d2a_*` databases: Shared 21/21, API 134/134 with all DB integration and 0 skipped, Web 35/35, total 190/190; Typecheck and Build passed, Next.js 27/27 pages. Baseline SQL and Stage 6C Migration were applied **only** to the disposable databases. Test fixture phone `0000000000` is fictitious; no actual message was sent. The temporary server was stopped after verification; do not use real `.env` or Production data.

Carry-forward decisions: whether real orders must require name/phone and their market-specific validation; concurrency-safe commercial order number (do not reuse Legacy `count+1`); branch/Outlet assignment; Whole Translation-Record snapshot design for multilingual history; currency display/rounding; long WhatsApp URL UX; multi-instance acceptance signing key; production auth/rate limits; and real migration-history audit. `orderingEnabled:false` and the Legacy checkout gate remain. Await explicit Stage 6D.2B instructions; do not start it or Stage 6D.3 automatically.

## 17. Stage 6D.2B — Isolated End-to-End Network Order Flow (latest)

Read `STAGE_6D_2B_NETWORK_ORDER_FLOW_REPORT_AR.md` for the complete file list, safe local setup, test evidence, actual saved-order WhatsApp message, and gaps. Code commit `184adee` connects the existing Stage 6B Network Cart to Stage 6C test-only prepare/create and Stage 6D formatter. A new guarded Next.js route `/m/[slug]/network-order-test` shows the trusted server Draft, demands explicit acceptance, handles changed-price HTTP 409 with renewed consent, and reads a sealed saved Snapshot via the new guarded API `GET /public/menus/:restaurantSlug/orders/network-test/:orderId/preview`. It only copies/displays the WhatsApp message; it never sends or opens it. No pricing, Checkout, or Order Persistence was duplicated. The existing Legacy path remains unchanged and Network/mixed cart cannot use Legacy Checkout.

The new route and cart entry are server-gated by non-Production mode, explicit flag, loopback Host, and loopback API URL. The API retains Stage 6C loopback, flag, NODE_ENV and **actual disposable PostgreSQL database** gates. The seed and repeatable Chrome CDP script additionally require the exact Stage 6D.2B disposable demo DB name on `127.0.0.1:55440`. Chrome Browser E2E passed an entire Pizza + repeated Linked Combo + cart persistence + trusted Draft + explicit acceptance + saved Snapshot + WhatsApp preview flow. It changed a Size price in the disposable DB between Draft and create, verified no Order was saved on the stale acceptance, accepted the new `423.5 EGP` Draft, verified exactly one saved Order, then restored the catalog price and confirmed the historical message was unchanged. RTL/mobile 390px checks passed. This was not a fixture-only formatter test.

Fresh PostgreSQL 16 cluster `../work/stage6d2b-postgres-data` was used with three separate disposable databases (demo, orders, API regression) containing only test Baseline SQL plus Stage 6C Migration. Final tests: Shared **21/21**, API **134/134** with zero skipped, Web **39/39**, total **194/194**; root Typecheck and Build passed. An initial API run pointed two parallel integration suites at one database and failed from fixture contention; rerun with separate databases passed. No real `.env`, Production DB, real Migration, Backfill, deployment or WhatsApp send was used. Stop the temporary servers/cluster after testing.

Browser coverage still lacks separate UI scenarios for Availability/Revision changes, invalid selections, duplicate submission, Delivery, mixed carts and guard-off behavior; underlying API/Web tests cover their core contracts. Full Browser Legacy Checkout regression and visual prototype comparison were not performed. The approved currency rounding/display policy, production security/rate limits, multi-instance HMAC signing, order number, Branch/Outlet, real Migration History, and WhatsApp activation are still unresolved. `orderingEnabled:false` stays mandatory. **Stop after Stage 6D.2B; Stage 6D.3 needs a new explicit authorization.**

## 18. Stage 6D.3A - Browser E2E Completion & Order Presentation QA (latest)

Read `STAGE_6D_3A_BROWSER_QA_REPORT_AR.md` for the 15-scenario matrix, actual persisted Combo message, test commands, limitations and Production blockers. Code commit `2f1b18b` extends `scripts/stage6d2b-browser-e2e.mjs` rather than adding another framework. It runs independent/sequential Pizza, repeated Linked Combo, Cart reload, changed-price reacceptance, Configuration Revision, Availability, invalid selection, rapid duplicate click, idempotent retry, Delivery, Pickup, mixed Cart, flag-off API, Legacy Checkout UI, and RTL/mobile 390px cases. Final Chrome CDP result: **15 passed, 0 failed, 0 skipped**. The invalid-selection, retry, and flag-off checks issue HTTP requests from browser context; a separate flag-off Next page was not exercised in the browser, although its server gate remains covered by Web unit tests.

The only Product-code adjustment is to the pure WhatsApp Formatter: linked components are numbered once in message order, and a zero-charged linked Size is labeled "no extra charge for this size" rather than implying the entire component is free. Shared Price Breakdown semantics, Included Quantity, money, Stage 6C transaction strategy, Order persistence, and Legacy Checkout were not changed. A formatter regression test verifies the linked zero-size language and exact saved totals. The disposable Demo seed now provides its own `CART_ORDERING` entitlement for Legacy UI QA and pre-creates category `all` to avoid a first-read race in the existing Public Menu service; no real package configuration changed.

Verification used a **new** PostgreSQL 16 cluster `../work/stage6d3a-postgres-data` at `127.0.0.1:55440`, with distinct `ordersawa_stage3_stage6c_stage6d3a_demo`, `_orders`, and `_regression` databases. Baseline test SQL and the Stage 6C snapshot SQL were applied there only. Final Shared **21/21**, API **135/135**, Web **39/39**, total **195/195** with zero skipped; root Typecheck and Build passed. The browser read a sealed Order Snapshot actually saved in disposable PostgreSQL, displayed its full Combo message, and confirmed the message remained identical after restoring a changed catalog price. No real `.env`, Production DB, Migration, Backfill, deployment, or WhatsApp send was used.

Still unresolved: a pre-existing first-read `ensureAllCategory` race outside the seeded fixture, a separate browser check of the Next flag-off page, currency rounding/display policy, Production auth/rate limits, multi-instance HMAC key, order number, Branch/Outlet, historical translation design, real Migration History, and actual WhatsApp activation. **Stop after Stage 6D.3A. Stage 6D.3B and any Production work require new explicit approval.**

## 19. Stage 6D.3B - Security, Performance & Production Readiness Audit (latest)

Full report: `STAGE_6D_3B_SECURITY_READINESS_AUDIT_AR.md`. This was **audit/verification only**, not a Product runtime change. New test file: `apps/api/src/modules/public-menu/network-readiness.audit.integration.spec.ts`; this handoff and the report are the only other changed files. Check `git log -1 --oneline` for the independent audit commit.

Verified against a **new** isolated PostgreSQL 16 cluster at `../work/stage6d3b-postgres-data`, `127.0.0.1:55440`, with separate `ordersawa_stage3_stage6c_stage6d3b_tests` and `_audit` databases. Only test Baseline SQL and Stage 6C SQL were applied there. A deterministic two-reader race against real PostgreSQL proves one `P2002` on concurrent first `all` category creation; a soft-deleted `all` row also produces `P2002` on every attempted recreation. A fault-injection test proves exhausted `P2034` retries escape test-order `prepare` as an unmapped Prisma error, whereas `create` maps them to 409. The audit did **not** repair these defects; the report proposes small separate fixes.

Local benchmark (one warm-up + five sequential measurements per size; not a Production SLA): 10/100/1000 products yielded median Quote **2.68/3.57/18.76 ms** and median Serializable Prepare **8.57/7.44/30.76 ms**. Whole-catalog fetch and whole-tenant Product row locks remain a demonstrated scalability concern; concurrent load and deep Linked worst-case have not been measured. Existing Stage 6C tests confirm trusted repricing, tenant scoping, token/idempotency constraints, rollback and immutable snapshots; no wrong-price order or cross-tenant snapshot access was demonstrated. Current endpoints remain test-only; Production auth, distributed rate controls, shared/rotatable HMAC key, migration-history audit, Business/Outlet context and founder financial decisions are unresolved blockers.

Final directed checks: new audit suite **4/4**, API Quote/Contract/Formatter/Order HTTP+DB **44/44**, Shared **21/21**, Web **39/39**, total **108/108** non-overlapping tests with zero skips. Root Typecheck passed. A separate test-source `tsc` still fails at existing `network-orders.integration.spec.ts:316` and `product-import-parser.spec.ts:23`; no new test-file diagnostics. No independent Build, full API suite, Browser E2E or multi-client load test ran during this audit. No real `.env`, database, migration, backfill, deployment or WhatsApp send was used. `orderingEnabled:false` remains.

Follow-up order **only after approval**: (1) atomic/system-category `all` fix and HTTP race regression; (2) map exhausted Prepare serialization to structured 409; (3) founder financial/operational decisions; (4) Production auth/privacy/HMAC/rate controls; (5) bounded catalog/lock performance work after concurrent benchmarks; (6) read-only Migration History audit with separate database-access authorization. Do not start any of these automatically.

## 20. Stage 6D.3C1 - Public Menu Race Condition Fix (current)

Read `STAGE_6D_3C1_PUBLIC_MENU_RACE_FIX_REPORT_AR.md` for root cause, exact file list, test matrix and limits. `apps/api/src/modules/public-menu/public-menu.service.ts` now looks up the protected `all` category with tenant-scoped unique `(restaurantId, slug)` even if soft-deleted; an existing row is restored in place only when needed, preserving its ID, product relationships and presentation metadata. On a missing row, creation catches **only** a `P2002` for that composite key, re-reads the same tenant row and restores it if needed; unrelated database errors propagate. The existing Stage 6D.3B audit regression was updated to expect success. New `public-menu-race.integration.spec.ts` uses real Nest HTTP requests and a fresh PostgreSQL 16 disposable database, forcing concurrent first reads rather than pre-seeding `all`.

Final tests on a new cluster `../work/stage6d3c1-postgres-data`, loopback `127.0.0.1:55440`, with separate fresh databases for HTTP race, audit, Product Configuration/API regression, and Network Orders: HTTP race **8/8** (including two/eight concurrent requests, soft-delete ID/relation retention, tenant isolation, unrelated `P2002`/`P2003` propagation); full API **147/147 in 22 files, 0 skipped**; root Typecheck and Build passed (27/27 Next.js pages); `git diff --check` passed. Test Baseline SQL and, only where needed, Stage 6C SQL were applied to those disposable databases. The cluster was stopped after use. No real `.env`, database, migration, backfill or deployment was used. Shared/Web tests were not rerun independently, and Browser E2E was not run; neither runtime path was edited.

Carry-forward: the separate Dashboard `ensureAllCategory` helper was not altered, nor was Stage 6D.3B's exhausted-`P2034` Prepare behavior. All Founder financial/operational decisions, Production auth/HMAC/rate policy, actual Migration History, and real ordering remain unresolved. `orderingEnabled:false` is still required. **Do not start Stage 6D.3C2 automatically.**

## 21. Stage 6D.3C2 - Prepare Transaction Conflict Handling Fix (current)

Read `STAGE_6D_3C2_PREPARE_CONFLICT_FIX_REPORT_AR.md` for the exact contract, files, test matrix, and unresolved blockers. Only `NetworkOrdersService.prepare` runtime behavior changed: after the existing `runSerializable` exhausts three attempts, the existing `isSerializationConflict` predicate maps `P2034` and `P2010` with PostgreSQL `40001`/`40P01` to HTTP 409 `{error:"NETWORK_ORDER_CONCURRENT_UPDATE", message:"Catalog changed concurrently; retry with a new quote."}`. Unrelated errors still propagate. `runSerializable`, `create`, Serializable/FOR SHARE locking, pricing, order persistence, acceptance, idempotency, frontend, and test-only gates were not modified. The Stage 6D.3B audit regression now expects the fixed response.

New `apps/api/src/modules/orders/network-order-prepare-conflict.integration.spec.ts` runs actual Nest HTTP and Prisma/PostgreSQL transactions with fault injection **inside** each transaction after the real callback and a rollback marker. It covers successful Prepare, temporary retry, all three exhausted conflict variants, no Prisma detail leaks, unrelated DB error propagation, rollback/no Order, unchanged Create/idempotency, and disabled test flag. Tests require a dedicated new disposable database named `ordersawa_stage3_stage6c_stage6d3c2_conflict` on `127.0.0.1:55440` and verify its actual identity before writing fixtures.

Final isolated PostgreSQL 16 run used new `../work/stage6d3c2-postgres-data` with separate fresh test databases. New HTTP suite **9/9**, full API **156/156 in 23 files, 0 skipped**, root Typecheck and Build passed (27/27 Next.js pages). Test Baseline and Stage 6C SQL were applied to disposable databases only; no real `.env`, Production database, migration, backfill, deployment, or WhatsApp send. Shared/Web tests were not run independently; Browser E2E was not run because this change is confined to Backend error handling. Extra test-source TypeScript compilation still reports only the existing `network-orders.integration.spec.ts:316` and `product-import-parser.spec.ts:23` issues.

Carry-forward known issues: the separate Dashboard `ensureAllCategory` helper; full Restaurant Catalog loading per Quote; `FOR SHARE` locks on all tenant Product rows in Prepare/Create; missing concurrency/50-line/10k-product/deep Nested/Linked benchmarks; the two old test-source TypeScript errors; and **all** Stage 6D.3B Production blockers (financial policy, auth/privacy/rates, HMAC, order number/phone/delivery rules, multilingual snapshot, real Migration History, Business/Outlet/Service Mode/Scheduling, WhatsApp sending). None is resolved by this stage. `orderingEnabled:false` and test-only endpoint guards remain mandatory. **Do not start Stage 6D.3C3 automatically.**

## 22. Stage 6D.3C3 - Catalog Scaling & Concurrency Benchmark (current)

Read `STAGE_6D_3C3_PERFORMANCE_BENCHMARK_REPORT_AR.md` for methodology, numeric tables, limitations, and the proposed **unimplemented** Dependency Closure design. This was benchmark/analysis only: new manual `scripts/stage6d3c3-benchmark.mjs`, report, and this handoff; no `apps/`, `packages/`, Prisma, lock, pricing, order, Cart, or WhatsApp code changed. The tool runs real Nest HTTP controllers/services against a fresh, name/host/port-verified PostgreSQL 16 disposable DB (`ordersawa_stage3_stage6c_stage6d3c3_bench` at `127.0.0.1:55440`), with Baseline + Stage 6C SQL applied there only. It refuses a pre-populated DB, Production mode, or missing test flag. It does not load real `.env`.

Direct HTTP sequential medians on 10/100/1,000/10,000 products: Quote **10.47/10.73/23.31/154.86 ms**, Prepare **11.09/11.66/29.40/234.76 ms**, Create **20.71/22.07/37.99/258.46 ms** (9 samples each except 5 at 10k). At 1,000 products/25 concurrent requests, a separate confirmation run found Quote median/P95 **193.68/198.95 ms**, Prepare **196.08/283.43 ms**, Create **604.45/774.09 ms**; **33/50 Create succeeded, 17/50 returned structured 409** after Serializable retries. Correct totals, exact persisted Order counts and sealed Snapshots were checked in the measured waves; this does not prove all worst-case races safe. A directed 250-ms transaction hold proved an unrelated Product B UPDATE waited **266–326 ms** while `lockCatalog` held all Product row locks, compared with **1.79–2.68 ms** baseline. Combo with repeated ORIGINAL/CUSTOM instances and a 50-line Order were measured; deep worst-case and 25×10k remain unmeasured. No Production SLA follows from local results.

Validation: benchmark completed with `stopped:null`; `node --check` passed; focused API Quote/Configuration/Order Contract **16/16** after pointing TEMP/TMP inside workspace; root Typecheck and Build passed (27/27 Next.js pages). The first Vitest invocation could not start tests because Windows Temp was outside writable scope; the corrected invocation passed. Full API/Shared/Web suites and Browser E2E were not rerun because no runtime source changed. The disposable cluster was stopped after work; do not use its retained synthetic Fixture files as an existing project DB.

Follow-up needs separate approval: design and validate bounded Dependency Closure Loading/Locking with cycle/isolation/ORIGINAL/CUSTOM/availability and concurrent-update parity; investigate Create 409 rate with better attribution; benchmark deeper configurations/25×10k/multi-instance if safe. Do **not** silently change `FOR SHARE`, Serializable strategy, Shared Engine, or acceptance/idempotency to improve the numbers. All Stage 6D.3B Production blockers and the Dashboard `ensureAllCategory`/two old test-source TypeScript issues remain. `orderingEnabled:false`; no real DB, Migration, deployment, activation or WhatsApp send. **Stop after Stage 6D.3C3 and await explicit approval.**

## 23. Stage 6D.3C3B - Concurrency Conflict Root Cause Analysis (current)

Read `STAGE_6D_3C3B_CONCURRENCY_ROOT_CAUSE_REPORT_AR.md` for HTTP matrices, PostgreSQL evidence, hypotheses, correctness checks, and proposed **unimplemented** fixes. Only the manual Stage 6D.3C3 benchmark script, report, and this handoff changed; `apps/`, `packages/`, Prisma schema/history, Order persistence, `FOR SHARE`, and Serializable retry strategy did not. The tool gained `STAGE6D3C3_DIAG=1` and `=probe` modes with exact disposable-database guards. A new PostgreSQL 16 cluster `../work/stage6d3c3b-postgres-data`, `127.0.0.1:55440`, was used with test Baseline + Stage 6C SQL only, then stopped. No real `.env`, database, migration, backfill, deployment, or WhatsApp send.

Confirmed mechanism: `create` makes missing-key `findUnique` probes on `(restaurantId,idempotencyKey)` and `(restaurantId,acceptanceTokenHash)` inside Serializable, then writes an Order. In synthetic SQL probes **without Catalog reads or Product row locks**, read-only misses succeeded 25/25, Order-only inserts 25/25, but an idempotency miss + insert yielded **22/25 `P2034`**, acceptance miss + insert **21/25**, and both misses + insert **22/25**. A relation-level `SIReadLock` was observed on the acceptance unique index; EXPLAIN showed each missing-key query uses its matching unique index. Even five distinct restaurants produced 4/5 `P2034` in the read-then-insert probe, indicating index predicate-lock conflicts can cross tenant keys without data leakage. The actual HTTP Create reproduced structured 409 at 1/5/10/25 concurrency and 100/1000 products; all equivalent Prepare waves succeeded. Different products/selections did not remove the conflict. No `40P01`, `P2010`, or unique-violation explanation was observed in these directed runs. Full Catalog loading/`FOR SHARE` may lengthen the conflict window but are not necessary for this mechanism; do not attribute every Create abort exclusively to one index.

Correctness: measured successful HTTP Orders retained exact trusted totals and sealed Snapshots; 409 saved no extra Order. Sequential/concurrent idempotent retry returned the same saved Order; token reuse with another key was rejected; a changed Size price/Revision after Prepare rejected old Acceptance with 409 and zero new Orders; cross-tenant Quote returned 404. Shared **21/21**, focused API **16/16**, script syntax, and root Typecheck passed. Full API/Web/Browser and Build were not rerun because no Product runtime changed. 25-way price mutation, deep complexity, 25×10k, and multi-instance work remain unmeasured.

Any remedy for the read-before-write SSI pattern needs a separate design/approval preserving requestHash binding, single-use acceptance, draft revalidation, idempotency and immutable snapshots; blindly removing `findUnique`/`FOR SHARE` or weakening isolation is unsafe. Dependency Closure could reduce Catalog/lock time but cannot by itself solve Order-index SSI. All Stage 6D.3B Production blockers, Dashboard `ensureAllCategory`, and two existing test-source TypeScript errors remain. `orderingEnabled:false`. **Stop after Stage 6D.3C3B; wait for explicit authorization before implementation.**

## 24. Stage 6D.3C3C - Atomic Idempotency Proof of Concept (current)

Full report: `STAGE_6D_3C3C_ATOMIC_IDEMPOTENCY_POC_REPORT_AR.md`. Only a manual, guarded `scripts/stage6d3c3c-atomic-poc.mjs`, the report and this handoff changed. It compares the real Nest HTTP Create path to an independent loopback-only PoC HTTP server that calls the existing compiled Network service's restaurant/catalog locks and Shared-backed Draft validation, but claims the two existing Order unique indexes with an uncommitted `POC_PENDING` insert before absent-key reads. A `P2002` path re-reads in a new tenant-scoped Serializable transaction and replays only exact-request-hash, sealed `NETWORK_TEST` Orders. The script also runs isolated SQL probes including `ON CONFLICT DO NOTHING`; it never changes an application route or schema.

A **new** PostgreSQL 16.15 cluster `../work/stage6d3c3c-postgres-data` at `127.0.0.1:55440` with exact fresh DB `ordersawa_stage3_stage6c_stage6d3c3c_poc` received only test Baseline and Stage 6C snapshot SQL. Final directed run: 18 SQL waves and 40 HTTP waves at 1/5/10/25 concurrency, plus replay, rollback, stale revision/price, tenant, historical snapshot and negative-control checks. At 25 independent requests in one tenant, current HTTP Create succeeded **8/25** and returned **17/25 409**, whereas PoC succeeded **25/25** with 5 internal retries. Across five tenants, current **12/25**, PoC **24/25** with one 409 and 12 retries. The SQL read-before-insert probe got **22/25 P2034**, direct atomic insert 25/25. **Concurrent duplicate keys with `ON CONFLICT DO NOTHING` still produced `P2010:40001`** (4/5 and 8/25). One request per duplicate-key wave was saved; same-payload replay, different-payload rejection and token single-use worked in the directed HTTP trials. Product price/Revision changes rejected old acceptance without an Order; sealed historical Snapshot and replay survived later catalog changes.

**Do not implement this PoC in production.** A negative test proved the current DB permits a committed unsealed `POC_PENDING` Order. The script's happy-path discipline is not a DB safety guarantee. A future stage requires explicit approval to design a commit-time invariant or separate Claim storage, compare safety/complexity, and run broader Linked/Capability/Availability/multi-instance/concurrent-failure tests. Existing Stage 6D.3B financial, HMAC, authentication, rate, migration-history and Business/Outlet blockers remain. No full Shared/API/Web suites or root Typecheck/Build were rerun because no application runtime changed; only the directed PoC and syntax/guard/Git checks ran. The disposable server was stopped; no real `.env`, real DB, operational Migration, Backfill, deployment or WhatsApp send was used. `orderingEnabled:false`; **stop after Stage 6D.3C3C and await approval.**

## 25. Stage 6D.3C3D - Safe Atomic Order Design (latest)

Read `STAGE_6D_3C3D_SAFE_ATOMIC_ORDER_DESIGN_REPORT_AR.md` for design tradeoffs, exact concurrency table, PostgreSQL and negative-commit evidence, DB/application guarantee split, and small proposed follow-ups. Only manual `scripts/stage6d3c3d-safe-order-poc.mjs`, disposable-only `scripts/stage6d3c3d-disposable-invariants.sql`, report, and this handoff changed. The PoC uses the compiled existing NetworkOrdersService restaurant/catalog locks and Shared-backed Draft, existing HMAC/contract, actual Nest HTTP baseline, and independent loopback PoC HTTP for two candidates. It does **not** change `NetworkOrdersService`, Shared Engine, Prisma schema, Migration History, Legacy flows, currency policy, or ordering activation.

A fresh PostgreSQL 16.15 cluster at `127.0.0.1:55440` with exact empty test databases `ordersawa_stage3_stage6c_stage6d3c3d_a` and `_b` received test Baseline + Stage 6C SQL plus guarded experimental DDL outside migration history. Design A inserts a complete Snapshot Order after trusted revalidation, then Items and seal within the same Serializable transaction; a deferred DB constraint rejects incomplete/mismatched commits. Design B uses a separate atomic Claim table with deferred bidirectional Claim/Order checks and unique token/key constraints. Both reject pending/incomplete commits in negative tests. Important observation: a Prisma interactive transaction callback can resolve even when a deferred COMMIT check rolls back; the candidate therefore forces `SET CONSTRAINTS ALL IMMEDIATE` before callback completion and confirms the exact sealed Order in a new scoped read before 201. This behavior needs dedicated Prisma-version verification before runtime implementation.

Two-wave HTTP tests at 1/5/10/25 concurrency in one and five tenants found, at 25, current Create **25/50 and 19/50 success**, A **50/50 and 50/50**, and B **50/50 and 50/50** in the final run; B had markedly more internal retries (26 and 17 vs A 0 and 3). Separate SQL read-before-insert got **12/25 success, 13 P2034**; direct insert **25/25**. Duplicate key/same payload replayed one saved Order, changed payload returned 409, and reused Acceptance Token with another key returned 409. Pizza/Nested/Included priced `265.000004 EGP`, repeated ORIGINAL/CUSTOM Combo `43 EGP`, and stale price/Revision, availability, capability, tenant, historical Snapshot, timeout and partial-commit paths passed directed checks. A read-only final check found zero unsealed Network test Orders in both DBs and zero pending Claims. These PoC HTTP timings are not Nest production latencies; 40P01 was not observed. General Shared/API/Web tests and Typecheck/Build were not rerun because runtime did not change.

**Recommendation is conditional, not authorization:** prefer A for its smaller future schema change, but a production-grade deferred completion constraint and full integration tests need separate approval. PostgreSQL can enforce structural Snapshot/Item/amount consistency and uniqueness; it cannot prove Shared semantic price validity or HMAC acceptance without application checks inside Serializable. Do not copy this experimental SQL into migrations. Stage 6D.3B Production blockers, Dashboard `ensureAllCategory`, old test TypeScript errors, 10k/deep/multi-instance performance gaps, and real Migration History remain. No Production DB, real migration, backfill, deployment, WhatsApp send or activation. `orderingEnabled:false`; **stop after Stage 6D.3C3D and await approval.**

## 26. Stage 6D.3C3E - Hardened Network Order DB Completeness Guard (previous)

Read `STAGE_6D_3C3E_DB_COMPLETENESS_GUARD_REPORT_AR.md` for full SQL invariants, individual negative tests, Prisma commit behavior, performance numbers, and Stage 6D.3C3F requirements. Only `scripts/stage6d3c3e-network-order-completeness-candidate.sql`, manual `scripts/stage6d3c3e-db-guard-verify.mjs`, the report, and this handoff changed. There was **no** `NetworkOrdersService`, Shared Engine, Prisma schema, official Migration History, Legacy checkout, or ordering activation change. The SQL is explicitly **a disposable-only candidate, not an operational Migration**.

The candidate adds a deferred constraint trigger scoped to `source=NETWORK_TEST`. At final state it requires a sealed Order, structurally valid `cartSnapshot`/order identity, exact decimal total/currency, 1-50 Snapshot lines and 1-100 units, matching OrderItems (including their exact `options` JSONB multiset and duplicate linked instances), matching tenant/Product/quantity/name/config revision, and line/price-breakdown arithmetic using PostgreSQL `numeric`. Stage 6C seal and immutability triggers remain intact; a valid `Order INSERT → OrderItems INSERT → Seal → Commit` still works. PostgreSQL cannot establish HMAC acceptance, live availability/capability, or semantic Shared pricing; those remain in-transaction Backend responsibilities. Existing rows need pre-migration audit, and actual Migration History needs separate authorization before any operational SQL.

A **new** PostgreSQL 16.15 cluster at `127.0.0.1:55440` under `../work/stage6d3c3e-postgres-data` received test Baseline + Stage 6C SQL in exact fresh guard/control/integration databases, and the candidate only in guard/integration. No real `.env` or existing database was used; the temporary server was stopped after tests. Directed verification: **25/25 negative/rollback cases** left zero partial Network Orders; successful Pizza with Nested/Included `265.000004 EGP`, repeated ORIGINAL/CUSTOM Combo `43 EGP`, and 10/50-line Orders persisted. Existing Stage 6C HTTP/database integration **18/18** with the guard, Shared **21/21**, root Typecheck and Build (27/27 Next.js pages) passed. Full API/Web/Browser suites were not run because runtime source was untouched.

Critical Prisma 5.22.0 finding: a deferred constraint failure at PostgreSQL COMMIT may leave the interactive `$transaction` callback resolved, even though the Order was rolled back. A directed incomplete-order probe produced SQLSTATE `23514`, zero saved rows, but resolved callback. `SET CONSTRAINTS "Order_network_test_completeness_guard" IMMEDIATE` **on that constraint only** inside the transaction surfaced `P2010:23514` and prevented a false HTTP 201 in the isolated loopback probe. A future approved Stage 6D.3C3F must integrate Design A without absent-key pre-reads, preserve Shared/HMAC/Revision/Capability checks and Serializable/FOR SHARE, force the named guard before transaction exit, and perform a fresh tenant-scoped sealed-Order confirmation before success; do not assume callback resolution means COMMIT success. No Runtime implementation was made in this stage.

Manual 30-sample COMMIT medians (guard versus Stage 6C-only control) were 1 line **2.180 vs 0.632 ms**, 10 lines **6.928 vs 0.524 ms**, 50 lines **28.760 vs 0.758 ms**, linked Combo **2.061 vs 0.557 ms**. These local numbers are not Production SLA; the 50-line JSONB/Item scan needs profiling before approval, not weakening of invariants. All prior Stage 6D.3B Production blockers, real Migration History, Dashboard `ensureAllCategory`, test-source TypeScript issues, and deep-load risks remain. `orderingEnabled:false`; no real Migration, deployment, activation, or WhatsApp send. **Stop after Stage 6D.3C3E; Stage 6D.3C3F requires fresh explicit approval.**

## 27. Stage 6D.3C3F - Safe Atomic Order Runtime Integration (previous)

Full report: `STAGE_6D_3C3F_ATOMIC_ORDER_RUNTIME_REPORT_AR.md`. Founder ledger and supersession references remain in `../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/AUTHORITATIVE_RULES/`; follow the established read order before subsequent work. Branch `feature/product-configuration-network`; previous commit `5f812ab`, and the current independent Stage 6D.3C3F commit is obtained with `git log -1 --oneline`.

`apps/api/src/modules/orders/network-orders.service.ts` now creates complete `NETWORK_TEST` Orders without absent-key/acceptance-token pre-reads inside the existing three-attempt Serializable transaction. It preserves restaurant/catalog `FOR SHARE`, Shared-backed Draft, live price/Revision/Availability/Capability revalidation, HMAC acceptance, existing Stage 6C unique indexes, nested Items/Snapshot and seal. Before insertion, `network-order-db-guard.ts` verifies that this is exact loopback PostgreSQL 16 disposable storage with the expected Stage 6D.3C3E trigger/function fingerprints and Stage 6C triggers. After sealing, the named constraint alone is forced IMMEDIATE; after the transaction, a fresh tenant-scoped read verifies hashes/token/source/status/seal/Snapshot/Items before success. Ambiguous commits fail closed, while exact request replay after a committed-but-lost response retrieves the same sealed Order. P2002 is not automatically considered replay; exhausted P2034/P2010:40001/40P01 maps to structured 409. No `POC_PENDING` or Claim Table.

Modified files also include Stage 6C integration tests (10/50 lines), new atomic HTTP/PostgreSQL test suite, disposable candidate-SQL name allowlist, manual C3F benchmark mode, Browser E2E loopback-family startup fix, this handoff and report. Candidate SQL functions/trigger body, Prisma Schema, official Migration History, Shared Engine, Legacy Checkout, and operational frontend were not changed. Do **not** copy the candidate SQL into a real Migration or bypass its disposable-only guard without a new approval and read-only Migration History audit.

Tests on a new UTF-8 PostgreSQL 16.15 cluster at `127.0.0.1:55440` with fresh isolated databases and Test Baseline + Stage 6C SQL: atomic HTTP **28/28**, full API **186/186 in 24 files (0 skipped)** including Network integration **20/20** and Prepare conflict **9/9**, Shared **21/21**, Web **39/39**, Browser E2E **15/15**, Stage 6D.3C3E negative DB verifier **25/25**, root Typecheck and Build passed. Browser used real local API/Next.js with Pizza, repeated Combo, cart/reacceptance, legacy, RTL/mobile, and saved Snapshot WhatsApp preview without send. Tests prove missing/fake guard rejection, partial/finalization/Commit rollback, no false HTTP 201, exact replay after lost response, no cross-tenant order retrieval, and no duplicate successful Orders. The disposable cluster and dev servers were stopped after use; no project `.env` or real DB was used.

Manual Nest HTTP benchmark (1000 products, two waves): unique-key creates at concurrency 1/5/10/25 succeeded **5/5, 10/10, 20/20, 49/50**, with **0/0/0/1** HTTP 409 and internal serialization conflicts **0/1/14/26**; medians **46.73/100.44/256.68/382.79ms**, P95 only at 10/25 (**345.59/605.43ms**). Direct DB guard COMMIT costs at 50 lines remain high (~**29.924ms** median vs **0.851ms** control, 30 samples), and Full Catalog `FOR SHARE` still blocks unrelated Product edits. Previous C3C3 baseline is not a controlled identical-environment comparison. These are local results, not Production SLA.

Carry-forward blockers: no approved currency rounding/display policy, Production auth/rate/PII/HMAC secret management, commercial order number/phone/fees/taxes, historical translation design, real Migration History, Business/Outlet layer or WhatsApp sending policy. Dashboard `ensureAllCategory`, test-source TypeScript diagnostics and 10k/deep/multi-instance performance remain outside this stage. `orderingEnabled:false` and test-only gates remain mandatory. **Stop after Stage 6D.3C3F. No next stage, Production DB, operational Migration, deployment, Network Ordering activation or WhatsApp send without fresh explicit approval.**

## 28. Stage 6E.0 - Product Network Integration Compatibility Map (current)

Read the full, self-contained `STAGE_6E_0_NETWORK_INTEGRATION_COMPATIBILITY_MAP_AR.md` before any work on a newer Dashboard. This stage changed **only that report and this handoff**. It inventories Shared V1 Tree/Selection/Price/Snapshot, Admin API/atomic persistence, Public Configurator/Quote, Cart, guarded Prepare/Create, Stage 6D.3C3E candidate guard, WhatsApp preview and test gates with exact source paths and implemented/test-only/proposed status. It compares them against the current V62.4 Founder Ledger and Supersession Rules: canonical Business Catalog, stable-ID Outlet overlay/tombstones/local nodes/revert, same-Outlet effective Linked resolution, per-Outlet capability, operational states, Service Mode, schedules, Market/Business currency, and Business-owned translations/Outlet publication.

The source code remains Restaurant-centric: `Product.restaurantId`, restaurant-scoped dependency FK, `runtimeContext.scope="RESTAURANT"` with Outlet/Mode/Schedule flags false, cart identity by restaurant slug, and Stage 6C/F `NETWORK_TEST` Orders with no Outlet context. `Branch` exists for other functions but is **not** an implemented differential Product catalog. The V62.4 HTML baseline is available at `../work/stage5-references/03_OFFICIAL_BASELINE/OrderSawa_V62_4_Multilanguage_UX.html` outside Git; **no source for the founder's possibly newer Dashboard version was found in this repository**, so UI integration compatibility was not asserted. Get an identified newer Dashboard commit or Developer Golden Master and ownership/capability/action contracts before designing integration.

Stage 6D.3C3F final commit is `8f117f3e26006a14315023d93b07fc6a1b7541f3`. The map preserves separate debt: full Catalog loading (10k Quote median 154.86ms and Prepare 234.76ms in older benchmark), full `FOR SHARE` blocking unrelated Product B, Stage F 49/50 creates at 25 concurrent/1000 Products with 1 remaining 409, 50-line candidate guard COMMIT median 29.924ms vs 0.851ms control, and Dashboard `ensureAllCategory` still unreviewed although PublicMenu equivalent was fixed. A fresh source-only test-TypeScript diagnostic returned the two known errors at `network-orders.integration.spec.ts:336` and `product-import-parser.spec.ts:23`. No database, server, benchmark, Runtime tests, Migration, deployment or activation ran in Stage 6E.0; previous Stage F verification remains historical evidence, not a new result.

Do not treat the compatibility map as a schema/API approval. Next work requires explicit instructions, the newer Dashboard source, founder decisions on currency/phone/fees/snapshot languages/WhatsApp, and independent authorization for read-only real Migration History before any operational migration. Preserve all test gates and `orderingEnabled:false`. **Stop after Stage 6E.0; no integration or repair begins automatically.**

## 29. Stage 6E.1 - Current Dashboard Product Configuration Integration (current)

The founder explicitly directed completing the **current Restaurant-scoped Dashboard and source** without waiting for Dashboard V2. This narrows the current task; it does not implement Business Catalog/Outlet Differential. Full report: `STAGE_6E_1_CURRENT_DASHBOARD_INTEGRATION_REPORT_AR.md`. Starting clean commit: `a850383`; Stage 6D.3C3F source remains at `8f117f3e26006a14315023d93b07fc6a1b7541f3`.

The existing Shared Engine, editor/preview, Admin GET/PUT and atomic persistence, Public Configurator/Quote, and future Network Cart/Orders/Snapshot/WhatsApp foundations were retained. New `POST /dashboard/products` optional `configurationIntent:"NETWORK_SETUP"` requires structural role permission and assigned `PRODUCT_CONFIGURATION`; it creates a hidden Legacy shell with a merchant-entered provisional Base price, then Dashboard redirects to its existing editor. Stage 2C DB check requires non-null Base while tree is null/version 0; no fake zero or null shell is written. The editor's normal PUT can save a Network Tree with Base=null, and availability is **not** auto-enabled. PATCH cannot use the intent. Product-list price presentation distinguishes Network from nullable Legacy and blocks Quick Price for Network; fractional price fields now accept browser input without imposing rounding.

**Release caveat:** `NETWORK_SETUP` is a request-time intent, not a persisted state. If someone explicitly toggles `isAvailable` before saving the first Tree, the shell could appear via Legacy public logic with its provisional price. This is not resolved by UI guidance alone. A persisted Draft marker or atomic initial Network creation would require separate design/approval/history audit; do not claim launch readiness. The product already has the full editor/Shared/API integration once its Tree is saved. No Prisma Schema/Migration, Shared pricing, Public/Order Runtime, test gates, Business/Outlet, or WhatsApp flow was changed.

Verification used a fresh loopback PostgreSQL 16.15 cluster under `../work/stage6e1-postgres-data`, with separate `ordersawa_stage3_stage6e1` browser and `_api` API databases, test full schema plus Stage 6C SQL only. Focused HTTP/PostgreSQL Configuration **22/22**; full API **118 passed, 69 skipped** because unrelated DB suites require separate guarded databases/flags; Shared **21/21**, Web **39/39**; real Chrome/Nest/Next Browser **5/5 checkpoints** including setup, Pizza save/reload, RTL 390px and Legacy zero. Root Typecheck, Build (27/27 pages), Prisma Validate passed. Initial attempts using an incomplete test schema and a browser-populated DB failed; corrected isolated reruns passed. The test full schema lacks additional Stage 2C CHECKs, so real Migration History/operational DDL remains unverified. No real `.env`/DB/Backfill/Migration/Deployment/WhatsApp send.

New/changed files are listed in the Stage 6E.1 report; the browser runner is `scripts/stage6e1-dashboard-browser-e2e.mjs` and its screenshot is in `../work/stage6e1-dashboard-mobile.png` outside Git. Obtain the final independent commit with `git log -1 --oneline`; review `git status`. Next possible request is a separately approved Stage 6E.2 public WhatsApp Checkout **after** resolving setup-state exposure and commercial/financial/operational blockers. Do not repurpose `NETWORK_TEST` endpoints or remove `orderingEnabled:false`. **Stop after Stage 6E.1.**

## 30. Stage 6E.1A - Safe Network Product Setup and Activation Guard (current)

Stage 6E.1 commit is `d343c2ae923015a5c5b636ef211ff6e3e0ee115d`; this stage's full report is `STAGE_6E_1A_NETWORK_SETUP_ACTIVATION_GUARD_REPORT_AR.md`. Stage 2C Product CHECKs were read from the actual official Migration, not inferred only from Prisma. New `NETWORK_SETUP` POST now creates a real `ProductConfigurationV1` Tree `{schemaVersion:1, productId, revision:1, basePrice:null, groups:[]}` with `configurationVersion=1`, SQL Base `NULL`, `isAvailable=false` in one Product INSERT. Shared structure validation passes, but Shared pricing returns `MISSING_PRICE_SOURCE`; no fake price or Legacy shell is committed. A supplied provisional Base is rejected. First editor save is expectedVersion 1/revision 2 via the existing atomic GET/PUT path. Save does not change availability. `toggle-availability` denies an incomplete unpriced setup with structured 409 `PRODUCT_CONFIGURATION_SETUP_INCOMPLETE`; Public linked resolution treats it unorderable even under a forced DB availability flip. Legacy Public Menu/WhatsApp predicate still excludes all Network trees. `orderabilityState=SETUP_INCOMPLETE` clarifies Admin GET. Capability loss preserves the Tree.

Fresh PostgreSQL 16.15 disposable databases `ordersawa_stage3_stage6e1a_api` and `_browser` at loopback port 55440 received Test Baseline, test-only Stage 6C SQL and the **five Product CHECK constraint definitions plus VALIDATE statements extracted verbatim from Stage 2C Migration**. `pg_constraint.convalidated` was true for all five; an invalid null-Base Legacy INSERT failed and persisted no row. Focused HTTP/DB 23/23; full API 121 passed/69 skipped (unrelated guarded DB suites); Shared 21/21; Web 39/39; real Chrome/Nest/Next Browser 6/6 setup checkpoints; root Typecheck/Build, Prisma Validate and script syntax passed. Screenshot is `../work/stage6e1a-dashboard-mobile.png` outside Git. No actual real DB migration or history audit occurred. The disposable server was stopped after verification.

Do **not** silently convert any hidden Legacy shell that might have been created by the prior Stage 6E.1 source; it has no durable setup marker. An independently approved read-only real-data audit and explicit remediation plan would be required before deployment if such rows may exist. This source fix has no Prisma Schema change or Migration requirement for newly created products. Remaining Production blockers: currency presentation/rounding, real Migration History, Business/Outlet/Market, HMAC/Auth/Rate, commercial order details/fees, multilingual snapshots, WhatsApp sending, Full Catalog/locking. `orderingEnabled:false` and disposable-only Network Order gates remain. Obtain this stage's independent commit with `git log -1 --format=%H`; verify clean status. **Stop after Stage 6E.1A; do not begin Stage 6E.2 without new approval.**

## 31. Stage 6E.2 - Public Mixed Cart and Trusted WhatsApp Checkout (latest)

Full Arabic report: `STAGE_6E_2_PUBLIC_CART_WHATSAPP_INTEGRATION_REPORT_AR.md`. Stage 6E.1A starting commit `f152b06`; Stage 6E.2 implementation/tests commit `ec9e6ec`. Founder explicitly narrowed the current product to an Electronic Restaurant Menu with WhatsApp-only customer sending, authorized one mixed Legacy/Network cart and a public WhatsApp link flow, but **not** Order persistence, POS, Business/Outlet, Deployment, or automatic sending. The new public `POST /public/menus/:restaurantSlug/checkout/whatsapp/{prepare,confirm}` endpoints are independent of guarded `/orders/network-test/*`. Both require `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=1` (OFF by default) and a separate valid HMAC key. Prepare builds a Decimal-safe, DB-backed trusted draft and full message preview; confirm revalidates under Serializable and requires a matching 10-minute signed acceptance token before returning an official restaurant `wa.me` URL. On material change, HTTP 409 returns a new draft/preview and requires explicit reacceptance; no Order row is written. The browser opens a blank tab only on the customer click, closes it on failure, and redirects only after confirm. Legacy-only still uses its old checkout when the flag is OFF; when ON it uses the new trusted no-persistence path.

Main files: `apps/api/src/modules/public-menu/public-whatsapp-checkout.{contract,service}.ts`, controller/module/menu serialization, extracted reusable helpers in `apps/api/src/modules/orders/network-order-whatsapp-formatter.ts`, Web `trusted-whatsapp-checkout.tsx`, cart model/Client/API/CSS, HTTP integration spec and manual `scripts/stage6e2-whatsapp-browser-e2e.mjs`. The Stage 1 Shared Engine, `orderingEnabled:false`, Stage 6C/6D Design A/guard/acceptance/immutable snapshot test foundation, Prisma Schema/history, and Legacy Checkout endpoint were preserved. Never turn on NETWORK_TEST endpoints or reuse their disposable flags for this public flow. `basePriceExact` is a Decimal-string hint; server pricing always reloads Legacy Base and Network Tree/sources.

Final local validation used only two fresh PostgreSQL 16.15 disposable test databases with Test Baseline, official Stage 2C Product CHECKs, and Stage 6C test SQL on loopback port 55440: Shared **21/21**, full API **132 passed/69 skipped** (other guarded DB suites not counted), new HTTP checkout **11/11**, Product Configuration HTTP regression **23/23**, Web **40/40**, root Typecheck and Build, and Chrome/Nest/Next browser **8/8 checkpoints** including mixed cart, Pizza/Combo, reload, 390px RTL, complete preview, changed-price reacceptance and intercepted WhatsApp URL. Screenshot outside Git: `../work/stage6e2-mixed-cart-mobile.png`. The initial test baseline missed Stage 6C columns; the isolated DB was corrected and rerun. No real `.env`, DB, Migration, Deployment, actual WhatsApp connection or send. Not all requested scenarios were independent Chrome tests; see report for HTTP/Web alternative coverage.

Production activation remains **not approved**. Resolve currency rounding/display, real Migration History, HMAC production storage/rotation, distributed rate limits, customer-data and commercial-order policy, fees/taxes, historical language, Business/Outlet future work and full-catalog lock costs before any deployment/flag flip. The public no-persistence flow cannot guarantee the menu stays unchanged between returning a WhatsApp URL and a human sending it. Stop after Stage 6E.2 and wait for explicit approval before Stage 6E.3 or activation.

## 32. Stage 6E.3 — Final Current-System Integration & Regression (latest)

Read `STAGE_6E_3_FINAL_INTEGRATION_REPORT_AR.md` for the full inventory, source paths, test matrix, and release blockers. Starting branch was `feature/product-configuration-network`, clean at `e58dff5`; Stage 6E.2 code is `ec9e6ec`. Stage 6E.3 code/tests commit is `552b7dd2134c1bee3515e40a42489b8eeeb02aaf`; the report and this handoff are saved separately. The founder limited this stage to the current Restaurant Electronic Menu and WhatsApp customer flow—no POS, Business/Outlet, deployment, real DB, or automatic sending. The authority ledger/supersession files remain in `../work/product-network-pack/OrderSawa_Product_Network_Codex_Pack/AUTHORITATIVE_RULES/`; the current founder direction is intentionally narrower than the future Business/Outlet blueprint.

Confirmed Stage 6E.2 regression fixed: **Legacy-only cart now always uses the original persisted `/public/menus/:slug/orders/whatsapp` route even when `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT=1`**. Network-only and Mixed use trusted Prepare/Confirm only with the flag ON; with it OFF they cannot enter either Checkout. The old endpoint still creates Order/Items and analytics, while trusted Network/Mixed WhatsApp creates no Order. The old browser-price WhatsApp fallback on server failure was removed; the UI fails closed. No Shared Engine, Prisma schema/migration, Stage 6C/Design A, DB guard, or snapshot formatter was changed. A direct HTTP caller can still send Legacy-only to the new Stage 6E.2 Prepare/Confirm endpoint and get a no-persistence draft; the current UI never does so, but the public API contract needs review before activation if preserving History/Analytics for all clients is required.

Verification used new PostgreSQL 16.15 disposable DBs at loopback port 55440, test baseline plus **validated official Stage 2C Product CHECKs** and Stage 6C test SQL, with no real `.env`. Full API **133 passed/69 skipped** (5 guarded suites needing separate DBs), targeted checkout HTTP **12/12**, Product Configuration HTTP **23/23** inside API, Shared **21/21**, Web **41/41**, real Chrome ON **13/13 checkpoints**, OFF **4/4**, Dashboard setup/save/reopen **6/6**, Network-test direct HTTP 403, root Typecheck and Build (27 Next pages) passed. The Browser numbers are checkpoints, not independent proof of every requested scenario; unrun browser-specific branches are identified in the report. One initial Dashboard Browser attempt failed local CORS and passed after setting process-only `WEB_ORIGIN`; no source change. Both servers and PostgreSQL disposable were stopped; screenshot files under `../work/` remain outside Git.

Release remains **blocked pending explicit approval**: currency rounding/display, actual Migration History, production HMAC management, distributed rate limiting/PII retention, phone/fees/taxes/commercial order policy, WhatsApp handoff semantics and post-confirm change window, future Business/Outlet/Market/languages/scheduling. Full-catalog loading and all-row `FOR SHARE` during Prepare/Confirm remain performance debt; Stage 6C/F Design A guard cost and serialized conflicts belong to future Order foundation, not the no-persistence WhatsApp path. `ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT` stays OFF by default, `orderingEnabled:false`, and NETWORK_TEST loopback/disposable guards remain mandatory. **Stop after 6E.3; do not enable public checkout, deploy, migrate real data, send WhatsApp, or begin another stage without new approval.**
