# Private Staging — scoped risk acceptance proposal

Status: CONDITIONALLY ACCEPTABLE FOR PRIVATE STAGING, subject to the runtime and release results in VERIFICATION_RESULTS.md and the operator prerequisites below. This is not a vulnerability fix, a public deployment authorization, or Production approval.

- Advisory: GHSA-fc5q-39xc-vjpf / CVE-2026-112366, HIGH.
- Assessed: 2026-11-17. Expires: 2026-11-24 UTC, or immediately on a patched compatible release, new reachable input path, new High/Critical runtime finding, or failed mandatory gate (whichever comes first).
- Owner: founder for risk acceptance; deploying engineer for checking all conditions before any separate authorized deployment. The task authorized evaluating a narrow exception; external access controls have NOT been verified or implicitly approved.
- Full npm audit: FAIL (6 High dependency entries from one advisory). OSV: one affected package/version. Neither result is suppressed; CI security thresholds remain unchanged.
- Runtime npm audit: zero reported vulnerabilities. This is a lockfile advisory result, not proof that bundled third-party code is absent or universally safe.

## Dependency and input evidence

Installed chain: workspace devDependency vitest 4.1.12 -> vite 8.3.6 / @vitest/mocker / tinyglobby 0.2.17 -> picomatch 4.0.7; fdir 6.5.0 also optionally resolves picomatch. Vitest and Vite directly use picomatch too. tinyglobby compiles its caller's match/ignore patterns; fdir's glob path optionally loads it. These callers are repository test/build tooling, not imported by compiled API/shared application code. Build trusted source only: do not build unreviewed PRs or run tests against untrusted mounted source/config/uploads. Build/Test run locally or in a private builder without public dev server, HMR or Vitest API.

Important correction to the previous dev-only shorthand: Next 15.5.29 contains `next/dist/compiled/picomatch`, including after npm ci --omit=dev. Its vendored manifest has no version, so no version safety is inferred. It is used at runtime by `shared/lib/match-local-pattern.js` and `match-remote-pattern.js`, and in build tracing/middleware build code. Runtime image matching compiles patterns from the reviewed `apps/web/public-image-policy.json`; request URLs/filenames are the candidate string, not the pattern. No HTTP parameter or restaurant field becomes that configuration. A boundary test invokes the actual runtime matcher functions with hostile-looking URL candidates and records only the allowlisted fixed patterns at makeRe. The runtime image optimizer also rejects an unapproved host. This supports absence of the affected attacker-controlled-pattern path in this configuration; it does not claim the vendored implementation was removed or patched.

## Runtime isolation

`prepare-staging-runtime.cjs` creates a NEW directory outside the builder from an explicit allowlist. It installs the unchanged lock with `npm ci --omit=dev --ignore-scripts`, copies the same-platform generated Prisma client/engine, and excludes source tests, build cache, private env files and uploads. Vite, Vitest, tinyglobby, fdir, standalone picomatch, tsx and TypeScript must not resolve. Prisma CLI remains because @prisma/client declares an optional peer; npm installs it as a production peer, not because tests are required. It has no reported advisory and is not a listener. Next's compiled matcher remains and is separately assessed above.

PM2 validates the runtime tree before launch and invokes compiled Nest and Next `start`, bound to loopback; it never runs npm dev/test/watch. Nginx remains the reviewed reverse proxy. Runtime smoke starts these production entry points, checks API auth/tenant/Prisma, Next menu/static/image optimizer, upload retrieval, health/readiness, rejects dev endpoints, restarts both and repeats. It rejects an unsafe Staging identity. PM2 config is loaded and checked, but the external PM2 daemon/Nginx/TLS/Linux system are NOT locally proven.

## Conditions before any deployment

1. A separate explicit deployment authorization, an isolated private Staging host/database, restricted access (VPN/identity gateway or equivalent), no publicly reachable development tool ports, synthetic data only.
2. Build and generate on the deployment OS/architecture/Node version, in a private builder. Keep build and runtime trees separate. Deploy only the prepared runtime. Run full audit and OSV honestly; reject any new advisory beyond this named scope.
3. Zero High/Critical runtime audit, all functional and runtime checks PASS, current manifest and file hashes verified, backups and rollback available.
4. Operator records access controls and acceptance date before starting service; this document alone does not prove those controls exist. No real customer data, no Production use, no reuse for another build/configuration.
5. Check the official advisory before each build/deployment. On an official compatible patch, update only required dependencies and lock, rerun ci/full audit/OSV/build/typecheck/full release/runtime smoke, remove this exception. No automatic force/downgrade/CI bypass.

Production Release Gate: BLOCKED while the unresolved advisory and this Staging-only exception remain.
