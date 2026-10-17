# OrderSawa Stage 6F.4 — Release Manifest

| Item | Value |
|---|---|
| Release archive | `ORDERSAWA_FINAL_INTEGRATION_PACKAGE.zip` |
| Archive SHA-256 | `2D7524AC8DC1F87D43DDE54BA4DAD74CD81D0FEA00D45DA25E6B09D484E6D5A6` |
| Archive size | 10,214,775 bytes |
| Archive files | 375 source/documentation files (plus directory entries) |
| Git branch | `feature/product-configuration-network` |
| Exact packaged source commit | `e74743624a8784fbb5988188b390af1a3438da84` |
| Relevant baseline commit | `712c54a56724c6f4fd59d7bace3715e3d7566681` (Stage 6F.3) |
| Production audit attachment SHA-256 | `E4152E2449BFCA986DA374B9EE7F5290053D6643A8558E4CC1D2C41754AFE5D3` (raw attachment is **not** in the archive) |

The archive contains the current API, Web frontend and all its assets, Shared package, Prisma schema and official migrations, package manifests/lockfile, `.env.example` placeholders, integration tests and test tools, PM2 guide, migration plan, verification report, release blockers, and historical project reports. It excludes previous release ZIPs/manifests to avoid self-inclusion, `.git`, real `.env`, credentials, backups, customer data, `node_modules`, and local databases. The 375 archived files were compared with the selected Git tree paths; there were no missing or extra files. The only source-template change in this closure is `DOMAIN_VERIFY_BYPASS="false"`; Runtime/Prisma/SQL are unchanged. See the Arabic companion `ORDERSAWA_FINAL_INTEGRATION_PACKAGE_MANIFEST_AR.md`.

The source ZIP was rebuilt from raw Git blobs with `git -c core.autocrlf=false archive`. All five pre-Stage-2C migration files inside the archive have zero CRLF sequences and byte-for-byte SHA-256 matches to the founder-supplied read-only Production audit (5/5). The prior ZIP had altered only their line endings at packaging time; the official migrations in Git were not edited. Local verification: full API 206/206 on disposable PostgreSQL 16; focused current Product Configuration/WhatsApp HTTP 37/37 on disposable PostgreSQL 18.6; Shared 25/25, Web 43/43, Browser ON 14 and OFF 4 checkpoints, Typecheck and Build pass. The PG16-only future `NETWORK_TEST` DB guard is not a public WhatsApp prerequisite.

**Production status:** not approved. The supplied read-only audit reports five matching migration checksums, `numeric(10,2)` for four money columns, and zero incompatibility counts for the audited money rows. It does not verify full-schema equality, `ProductOption.priceDelta` value distribution, or backup restore; its data can change. Review the updated migration plan and run the migration only after isolated restored-database rehearsal and an explicit separate Production migration approval. Deploy with the public Network WhatsApp flag OFF under a separate approval; enabling it requires another approval. Do not run `prisma db push`, `migrate deploy`, or `migrate resolve` automatically.

The archive hash is intentionally in this sidecar rather than the archive itself: embedding its own hash would change the archive. Verify this SHA-256 before extraction, compare the server's existing source and local changes, and do not assume GitHub contains this source commit.
