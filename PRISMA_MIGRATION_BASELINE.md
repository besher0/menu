# Prisma Migration Baseline — Safe Recovery Plan

## Why the previous history could not replay

The earliest checked-in migration was
`20260719000000_add_category_visual_settings`, which runs
`ALTER TABLE "Category"` but no preceding migration created `Category`
or the other legacy tables. A clean PostgreSQL 16 CI database therefore
failed with PostgreSQL `42P01` / Prisma `P3018`.
`prisma db push` does **not** fix migration history or prove that
`prisma migrate deploy` works.

The first repository commit `3bd4532207ea` on July 20, 2026 contains
the historical legacy datamodel after the July 19 migration. The new
`apps/api/prisma/schema.legacy-baseline.prisma` reconstructs the schema
before that first migration by removing exactly the five category background
fields and `CategoryBackgroundType` enum it introduces. No later-migration
fields appear in the historical schema.

`20260718000000_initial_legacy_baseline/migration.sql` was generated from
that pinned datamodel with Prisma 5.22's `migrate diff --from-empty`;
it contains 31 legacy tables and 13 enums, plus historical indexes and
foreign keys. The DDL is now wrapped in an explicit transaction with an
up-front guard refusing any pre-existing application tables. All eight
previous migration SQL files remain unchanged, and
`migration_lock.toml` specifies PostgreSQL.

## Path A — Brand-new disposable/staging database

**Run only with reviewed, empty staging PostgreSQL credentials**, not with
the production URL or an existing database containing restaurant data.

From the repo root (the variables must already be set to that disposable DB):

```powershell
npx prisma validate --schema apps/api/prisma/schema.prisma
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx prisma migrate status --schema apps/api/prisma/schema.prisma
npx prisma migrate diff --from-url "$env:DIRECT_URL" --to-schema-datamodel apps/api/prisma/schema.prisma --exit-code
```

Expected: all nine migrations replay in chronological order, status has
no pending migrations, and Prisma diff exits 0 (no schema difference).
Do not swap in `db push` or `--accept-data-loss`. CI includes the same
replay and drift check against a fresh PostgreSQL 16 database.

The full GitHub Actions workflow also has an unrelated Stage 6C
Network Orders integration fixture which can fail independently;
inspect the **validate** job's migration replay, status and diff steps,
not only the overall run badge.

## Path B — Existing Neon/production database

**Do not run `migrate deploy` immediately after pulling this branch.**
Existing tables predate the added baseline; trying to replay it would
otherwise attempt to recreate them. The new migration guard refuses that
operation early and transactionally, but the migration still needs to be
registered as applied if its schema is already present.

1. Make a full backup, restore it to a separate disposable database or
   Neon branch, and verify that data, constraints, indexes, and row counts
   match. Do not use the tests' disposable schemas as the production clone.
2. Record a read-only migration status and check whether Prisma's metadata
   table exists. Avoid posting full connection strings or passwords:

   ```powershell
   npx prisma migrate status --schema apps/api/prisma/schema.prisma
   ```

   ```sql
   SELECT current_database(), current_user, current_schema(),
     to_regclass('public."_prisma_migrations"') AS migrations_table,
     to_regclass('public."Restaurant"') AS restaurant_table,
     to_regclass('public."Category"') AS category_table,
     to_regclass('public."Product"') AS product_table;
   ```

   If `_prisma_migrations` exists, inspect its `migration_name`,
   `finished_at`, `rolled_back_at` and `logs` (do not publish secrets
   embedded in logs). If it does not exist, the database has no Prisma
   migration ledger and requires a separate adoption plan.
3. On the **restored clone**, inspect differences between the real schema
   and the current datamodel, and inspect custom triggers/constraints not
   represented by Prisma. Decide which historical migrations have already
   been applied manually or recorded by Prisma. Never mark a migration
   applied merely because its filename exists.
4. If the clone already contains the baseline's 31 legacy tables and the
   subsequent changes are confirmed, **only then** test recording the new
   baseline as applied:

   ```powershell
   npx prisma migrate resolve --applied 20260718000000_initial_legacy_baseline --schema apps/api/prisma/schema.prisma
   ```

   This command edits Prisma's migration ledger; it does not run the
   baseline DDL. Use it **only after** validating the clone's history and
   having a tested restore path. An existing database where some later
   migrations were applied manually or partially requires individual
   reconciliation before `migrate deploy`.
5. After the restored clone's status, migration replay, drift, business
   integration tests and restore test all pass, separately approve a
   production migration plan. No production database mutation is authorized
   by this document or by a green empty-DB CI migration job.

## Safety boundaries

- Never edit or delete historical migrations that may be recorded in an
  existing `_prisma_migrations` ledger: their checksums matter.
- Never use `migrate reset` on production or an existing data-bearing DB.
- Never apply `db push --accept-data-loss` as a migration repair.
- Do not use the isolated Product Configuration, WhatsApp Checkout, or
  Public Menu Race E2E schemas as a production rollback or baseline target.
- The historical snapshot is a migration-generation reference, **not** the
  active runtime Prisma schema.


## Path C — Safe Neon PG18.6 migration replay in a dedicated empty schema

The disposable Neon test compute used earlier has a **pinned, exact endpoint**
and database identity. To test migration replay there without changing
`public` or previously created test schemas, use:

```powershell
git -c http.version=HTTP/1.1 fetch origin refactor/product-network-production-hardening
git merge --ff-only FETCH_HEAD
.\scripts\verify-migration-baseline-neon.ps1
```

The script reads the *reviewed disposable Neon* `DATABASE_URL` and `DIRECT_URL`
from `apps/api/.env`, validates the exact host, role, database, SSL and
PostgreSQL version, and uses the direct endpoint. It creates a **new, one-use**
schema `ordersawa_migration_replay_e2e` marked
`ordersawa:migration-replay:e2e-disposable:2026-11-05`. If the schema already
exists it refuses reuse; it will not truncate, delete, reset or drop anything.
It checks the schema is empty, runs `prisma migrate deploy` scoped exclusively
to that schema, verifies **34 application tables, 15 enums and nine completed
migrations**, then checks `migrate status` and Prisma schema drift.

Both process `DATABASE_URL` and `DIRECT_URL` are restored after the script,
and `.env` is unchanged. This is an actual schema-migration test: it does
**not** run `prisma db push`, and it does not alter `main`.

A successful run should end with
`PASS: nine migrations from empty Neon PG18.6 schema, status clear, no Prisma schema drift.`
If the script stops at any step, **do not** run migrate commands manually or
switch it to `public` to bypass the guard; send the error output for review.
If the same schema already exists from a prior attempt, do not drop it
automatically: choose and review a fresh schema name first.

Important: the test schema is an isolated namespace *inside* the disposable
Neon database, not a separate database or a Neon branch. This validates
clean bootstrap on PG18.6; it does **not** validate an in-place production
migration or repair production's existing `_prisma_migrations` ledger.
