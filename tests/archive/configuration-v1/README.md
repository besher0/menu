# V1 test retirement — 2026-11-17

Founder decision: V2 only; no commercial saved V1 conversion is required. The five original files are preserved byte-for-byte as `.txt`, with SHA-256 in `docs/staging/V1_CASE_DISPOSITION.json`. They cannot be accidentally discovered or typechecked as active tests. This is a documented retirement, not a skipped suite or a claimed pass.

All 90 original cases are individually classified. Supported invariants already ported in earlier Task6 are retained and rerun; uncovered V1 rejection, capability write and zero-price/delivery binding cases are added. Counts are dispositions of original cases, NOT counts of newly created tests. Several original cases map to one parameterized current test; count actual execution only once.

The old test-isolated orchestrator is preserved for historical review only. Its active entry point now forwards to test-release-v2.py, which runs every remaining integration file on guarded owned clusters. Ordinary product/import/export tests remain active. Applied migration history and V2 database checks are unchanged; the existing pre-upgrade V1 rejection rehearsal remains mandatory. Staging CLI now rejects unsupported saved configurations before migrations.

No archive file is executable or supported for use against any deployed database.

Counts: {"PORTED_TO_V2_OR_RETAINED_BUSINESS": 76, "ARCHIVED": 12, "REPLACED_BY_V1_REJECTION": 2}

The active `apps/api/src/modules/orders/network-order-contract.spec.ts` still rejects production mode, non-disposable database identities and non-loopback clients for the retained test-only writer. Archiving its old V1 integration fixtures does not remove this boundary test or enable the writer in staging/production. Historical SQL/PoC scripts and applied migrations remain unchanged and are not acceptance entry points.
