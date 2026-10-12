# Product Configuration Network — Stage 2C runbook

This runbook prepares migration execution. It does not authorize a connection or deployment.

## Hard gates

1. Obtain separate approval for the exact database host and database name.
2. Use an approved read-only credential to run `apps/api/prisma/product-configuration-history-audit.sql` with `psql`.
3. Record the database identity, PostgreSQL version, complete `_prisma_migrations` result, schema metadata, row counts, and a schema-only backup fingerprint.
4. Compare every database migration name and checksum with the unmodified local migration files. Never edit an already-applied migration.
5. Stop if there is an unfinished/rolled-back migration, checksum mismatch, unexpected schema drift, or unknown database identity.

## Missing initial migration decision tree

- If `_prisma_migrations` exists and all rows/checksums match, generate and review a Prisma diff from the audited database to `schema.prisma`. Proceed only when the diff is exactly the reviewed Stage 2C SQL.
- If `_prisma_migrations` is absent while application tables already exist, do not run `migrate deploy`. Prepare a baseline representing the exact pre-Stage-2C deployed schema, review its checksum and drift, then request explicit approval before any `prisma migrate resolve --applied` operation.
- If history is partial or does not match local files, freeze deployment. Preserve both histories and design a reconciliation plan; do not rewrite rows or migration files.
- If the target is an empty database, the repository still lacks an initial CREATE migration. Use the disposable baseline only for tests; do not represent it as production history without a separate baseline review.

## Proposed application sequence after future approval

1. Take a restorable backup and verify restore on an isolated PostgreSQL instance.
2. Run the read-only history/preflight audit and archive its output.
3. Put product-configuration writes behind a disabled feature flag or maintenance gate.
4. Apply `20261012000000_product_configuration_network/migration.sql` through the approved migration process.
5. Run Prisma diff and post-migration checks before enabling any backfill.
6. Run the backfill in dry-run mode with explicit checkpoint and quarantine files.
7. Review every quarantine reason and the expected eligible count.
8. Run small write batches with `--execute --confirm-database <exact-name>`, monitor locks/errors, and retain checkpoints.
9. Re-run dry-run and verification; expect no eligible unprocessed rows other than reviewed quarantine cases.
10. Keep legacy tables and legacy read paths until later stages are deployed and separately approved.

## Backfill command shape

Dry-run is the default:

```text
npm run prisma:backfill-product-configurations -w @menu/api -- \
  --batch-size 100 \
  --checkpoint-file <secure-path>/product-config.checkpoint.json \
  --quarantine-file <secure-path>/product-config.quarantine.jsonl
```

Writes require both flags:

```text
npm run prisma:backfill-product-configurations -w @menu/api -- \
  --execute \
  --confirm-database <exact-current_database> \
  --batch-size 100 \
  --checkpoint-file <secure-path>/product-config.checkpoint.json \
  --quarantine-file <secure-path>/product-config.quarantine.jsonl
```

Use separate checkpoint files for dry-run and execute mode; the tool refuses a mode mismatch so a dry-run cursor cannot silently skip write work. Use `--resume-after <product-id>` only when intentionally overriding a missing checkpoint. Keep checkpoint and quarantine files outside Git and protect them as operational records.

## Rollback

- Before any configuration/backfill data exists, the guarded rollback SQL can restore the old columns and types after a reviewed application rollback.
- The rollback aborts if a configuration tree, dependency, nullable Base, value over `DECIMAL(10,2)`, or value with more than two decimals exists.
- After backfill or six-decimal order writes, retain the additive schema, roll back application behavior, and use a reviewed forward fix. Do not discard configuration or round order history to force a DDL rollback.

## Money policy boundary

Internal persistence is `DECIMAL(24,6)`. Stage 1 continues to use exact decimal strings/BigInt with no floating-point money arithmetic. Values with more than six fractional digits must be rejected before persistence. Currency-specific quantization and rounding remain deliberately unimplemented until an authoritative decision is approved.

## Scope boundary

The transaction helper is not wired to a controller or service route in Stage 2C. No Dashboard, Public Menu, cart, or order behavior is activated by these files.
