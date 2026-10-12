# OrderSawa Product Configuration Network — Codex Handoff

Last updated: 2026-10-12

Current state: **Stage 3 is complete, tested, and committed. Stop here until the user explicitly approves Stage 4.**

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
- The commit titled `docs: update Codex handoff after Stage 3` contains this handoff revision.

At the end of Stage 3, the expected state is a clean working tree on the branch above. Verify with:

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
- Public rollout safety without editing Public Menu: saving a Network product atomically sets `isAvailable=false`, and the legacy availability endpoint cannot re-enable it before public integration.

No Dashboard UI, Public Menu, Cart, Checkout, migration history, schema migration, deployment, or production data was changed in Stage 3.

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
- Source products in ORIGINAL mode must already have a persisted configuration.
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

- Every Admin API network save sets `Product.isAvailable=false` atomically.
- Legacy toggle availability refuses to re-enable configured products.
- Quick price updates refuse configured products.
- Metadata updates cannot alter configured pricing outside the configuration endpoint.
- This is a temporary rollout safety gate. Stage 5 must replace it with the approved public resolver/configurator behavior.

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
- `PRODUCT_CONFIGURATION_CONFLICT` — 409.
- `PRODUCT_CONFIGURATION_CONCURRENT_UPDATE` — 409.
- `PRODUCT_CONFIGURATION_DEPENDENCY_EXISTS` — 409.
- `PRODUCT_CONFIGURATION_PRICE_MANAGED` — 409.
- `PRODUCT_CONFIGURATION_PUBLIC_INTEGRATION_PENDING` — 409.

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

### Stage 3 tests

- `apps/api/src/modules/products/product-configuration.integration.spec.ts`
- `apps/api/src/modules/products/product-configuration.service.spec.ts`
- `apps/api/src/modules/products/product-configuration.persistence.spec.ts`
- `apps/api/src/modules/products/products.controller.spec.ts`
- `apps/api/src/modules/products/products.service.spec.ts`
- `apps/api/src/modules/feature-flags/feature-flags.service.spec.ts`
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts`

## 7. Final verified test state

All final runs used the repository source and a workspace-local TEMP directory because the Windows sandbox denies Vitest access to the normal user Temp path.

- Shared Vitest: 21/21 passed.
- API unit + disposable integration: 72/72 passed in 15 files.
- Total: 93/93 passed.
- Disposable PostgreSQL integration subset: 8/8 passed.
- Prisma validate: passed.
- Prisma schema diff against disposable Stage 2C schema: `This is an empty migration.`
- Product-configuration tools typecheck: passed.
- Root typecheck (Shared/API/Web): passed.
- Root build (Shared/API/Web): passed; Next.js generated 27 pages/routes successfully.

Disposable DB details from the test run:

- PostgreSQL 16 runtime inherited from Stage 2B tooling.
- New cluster directory: `../work/stage3-postgres-data`.
- Bound only to `127.0.0.1:55440`.
- Database: `ordersawa_stage3_integration`.
- Full schema generated with Prisma diff from empty and applied as SQL with `psql`.
- No `db push`, `migrate deploy`, real `.env`, existing database, or existing volume was used.
- The disposable server was stopped after testing.

## 8. Unresolved risks and required decisions

1. **Migration history is still unaudited on any real OrderSawa database.** Do not deploy the Stage 2C migration until the read-only history audit is separately approved and completed.
2. **No initial migration exists in the repository.** Follow the Stage 2C runbook; never rewrite or guess production history.
3. **Backfill rollout safety:** the Stage 2C backfill does not currently force `isAvailable=false`. Do not run it on real data before an approved rollout order prevents Network products from entering legacy public ordering.
4. **Public integration is not implemented.** Network products saved through Stage 3 are intentionally unavailable to public legacy paths.
5. **Capability model is an adapter.** Package version/snapshot/exception/market semantics need a future schema decision.
6. **Default package assignment is unresolved.** The capability exists but is not automatically mapped to BASIC/PRO/PREMIUM.
7. **Currency rounding policy is unresolved.** Keep decimal strings/`DECIMAL(24,6)`; do not introduce ad hoc rounding.
8. **External writers:** DB constraints enforce envelope/FK invariants, but semantic validation depends on the shared engine and atomic helper. New writers must use them.
9. **No HTTP socket E2E harness exists.** Stage 3 coverage is controller/service/unit plus real PostgreSQL integration.
10. **Business/Outlet differential architecture is not implemented.** Do not hard-code assumptions that make it impossible, but do not build it without approval.

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
4. Confirm Stage 1, Stage 2C, and Stage 3 files actually exist.
5. Read the Stage 3 Arabic implementation report.
6. Re-run the baseline tests before a new stage if practical.
7. Do not rebuild completed engine, schema preparation, persistence, or Admin API without a documented defect.
8. Ask for explicit approval if the requested work would change an unresolved decision above.

Useful commands (with a workspace-local TEMP directory):

```powershell
npm run test:shared
npm run test:api
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

The next proposed stage is **Stage 4 — Dashboard Product Configuration Editor**, only after explicit user approval.

Likely Stage 4 scope from the approved workflow:

- Extend the real product editor in `apps/web/src/components/dashboard/product-form.tsx`.
- Build an RTL vertical tree editor for Sizes, Options, nesting, quantities, included count, price overrides, linked ORIGINAL/CUSTOM, and validation.
- Use the Stage 3 GET/PUT API and optimistic revision contract.
- Preserve all current product fields and legacy behavior.
- Provide explicitly marked test/demo configurations only in test/seed data.

Do not begin Stage 4, Stage 5, deployment, or any real migration automatically. Stop and wait for explicit approval.
