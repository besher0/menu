# OrderSawa Stage 6F.4 — Release Manifest

| Item | Value |
|---|---|
| Release archive | `ORDERSAWA_FINAL_INTEGRATION_PACKAGE.zip` |
| Archive SHA-256 | `8BEFB5AE657FF14EAFEF53F2A0B37E6373BA74B00EF5B083235BE2D6B08061A1` |
| Archive size | 10,214,087 bytes |
| Archive files | 375 source/documentation files (plus directory entries) |
| Git branch | `feature/product-configuration-network` |
| Exact packaged source commit | `9ef10e2656488eee38f94a3b874c8150d9a0e384` |
| Relevant baseline commit | `712c54a56724c6f4fd59d7bace3715e3d7566681` (Stage 6F.3) |
| Production audit attachment SHA-256 | `E4152E2449BFCA986DA374B9EE7F5290053D6643A8558E4CC1D2C41754AFE5D3` (raw attachment is **not** in the archive) |

The archive contains the current API, Web frontend and all its assets, Shared package, Prisma schema and official migrations, package manifests/lockfile, `.env.example` placeholders, integration tests and test tools, PM2 guide, migration plan, verification report, release blockers, and historical project reports. It excludes previous release ZIPs/manifests to avoid self-inclusion, `.git`, real `.env`, credentials, backups, customer data, `node_modules`, and local databases. The 375 archived files were compared with the selected Git tree paths; there were no missing or extra files. See the Arabic companion `ORDERSAWA_FINAL_INTEGRATION_PACKAGE_MANIFEST_AR.md`.

**Production status:** not approved. The supplied read-only audit reports five matching migration checksums, `numeric(10,2)` for four money columns, and zero incompatibility counts for the audited money rows. It does not verify full-schema equality, `ProductOption.priceDelta` value distribution, or backup restore; its data can change. Review the updated migration plan and run the migration only after isolated restored-database rehearsal and an explicit separate Production migration approval. Deploy with the public Network WhatsApp flag OFF under a separate approval; enabling it requires another approval. Do not run `prisma db push`, `migrate deploy`, or `migrate resolve` automatically.

The archive hash is intentionally in this sidecar rather than the archive itself: embedding its own hash would change the archive. Verify this SHA-256 before extraction, compare the server's existing source and local changes, and do not assume GitHub contains this source commit.
