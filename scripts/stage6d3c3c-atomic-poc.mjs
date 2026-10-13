/**
 * Manual, disposable-only Stage 6D.3C3C PoC. Never import from application runtime.
 * Requires a NEW PostgreSQL 16 DB with test baseline + Stage 6C SQL. Never loads .env.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
require("reflect-metadata");
const { Module, ConflictException } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const { PrismaClient, Prisma } = require("@prisma/client");
const { PrismaService } = require("../apps/api/dist/modules/prisma/prisma.service.js");
const { NetworkOrdersService } = require("../apps/api/dist/modules/orders/network-orders.service.js");
const { NetworkOrdersController, NetworkOrderLoopbackGuard } = require("../apps/api/dist/modules/orders/network-orders.controller.js");
const { parseNetworkOrderRequest, sha256, verifyAcceptanceToken, issueAcceptanceToken } = require("../apps/api/dist/modules/orders/network-order-contract.js");

const dbName = "ordersawa_stage3_stage6c_stage6d3c3c_poc";
const url = process.env.STAGE6D3C3C_DATABASE_URL;
if (!url || process.env.NODE_ENV === "production" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1") {
  throw new Error("Explicit disposable URL, non-Production environment and test flag required");
}
const target = new URL(url);
if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== `/${dbName}`) {
  throw new Error("Refusing any database other than the exact Stage 6D.3C3C disposable target");
}
process.env.DATABASE_URL = url;

const db = new PrismaClient({ datasourceUrl: url });
const service = new NetworkOrdersService(db);
const tenants = Array.from({ length: 5 }, (_, i) => ({ id: `c3c-tenant-${i}`, slug: `c3c-${i}`, productId: `c3c-pizza-${i}` }));
const config = (productId, revision = 1, price = "100.000001") => ({ schemaVersion: 1, productId, revision, basePrice: null,
  groups: [{ type: "SIZE", id: "sizes", label: "Sizes", sizes: [{ id: "large", label: "Large", price }] }] });
const selection = (productId, revision = 1) => ({ schemaVersion: 1, productId, configurationRevision: revision,
  groups: [{ type: "SIZE", groupId: "sizes", sizeChoiceId: "large" }] });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sum = (v) => { const a = [...v].sort((x, y) => x - y); return { n: a.length,
  medianMs: a.length ? +a[Math.ceil(a.length * .5) - 1].toFixed(2) : null,
  p95Ms: a.length >= 20 ? +a[Math.ceil(a.length * .95) - 1].toFixed(2) : null }; };
const isSerialization = (e) => e?.code === "P2034" || (e?.code === "P2010" && ["40001", "40P01"].includes(e.meta?.code));
const metrics = { sql: [], http: [], safety: [] };
let app, pocServer, runtimeOrigin, pocOrigin;

async function verifyTarget() {
  const [actual] = await db.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port, version() AS version`;
  if (actual?.name !== dbName || actual.address !== "127.0.0.1" || actual.port !== 55440) throw new Error("Actual database identity mismatch");
  if (await db.restaurant.count() !== 0 || await db.order.count() !== 0) throw new Error("PoC refuses a previously populated database");
  const [indexes] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_indexes WHERE tablename = 'Order' AND indexname IN
    ('Order_restaurantId_idempotencyKey_key', 'Order_restaurantId_acceptanceTokenHash_key')`;
  if (indexes.count !== 2) throw new Error("Stage 6C unique indexes missing");
  return { postgresql: actual.version, database: actual.name, address: actual.address, port: actual.port };
}

async function seed() {
  await db.restaurant.createMany({ data: tenants.map((t) => ({ id: t.id, slug: t.slug, name: `PoC ${t.slug}`, currency: "EGP" })) });
  await db.subscriptionPlan.create({ data: { id: "c3c-plan", key: "C3C_TEST", name: "PoC plan",
    features: { create: { id: "c3c-feature", key: "PRODUCT_CONFIGURATION", enabled: true } } } });
  await db.restaurantSubscription.createMany({ data: tenants.map((t, i) => ({ id: `c3c-sub-${i}`, restaurantId: t.id,
    planId: "c3c-plan", status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z") })) });
  await db.product.createMany({ data: tenants.map((t) => ({ id: t.productId, restaurantId: t.id, slug: "pizza", name: "Pizza",
    currency: "EGP", basePrice: null, configurationVersion: 1, configurationTree: config(t.productId) })) });
}

// Alternative B is deliberately script-local. The uncommitted Order row claims BOTH existing unique indexes
// before any absent-key read. POC_PENDING can never commit: the same transaction must finalize, seal, or roll back.
async function atomicCreate(slug, raw, fault) {
  const request = parseNetworkOrderRequest(raw, true);
  const requestHash = sha256(request), acceptanceTokenHash = sha256(request.acceptanceToken);
  let retries = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await db.$transaction(async (tx) => {
        const restaurant = await service.lockRestaurant(tx, slug);
        const claimed = await tx.order.create({ data: { restaurantId: restaurant.id, totalAmount: "0", currency: restaurant.currency,
          status: "VALIDATED_TEST", source: "POC_PENDING", idempotencyKey: request.idempotencyKey,
          requestHash, acceptanceTokenHash } });
        const products = await service.lockCatalog(tx, restaurant.id);
        const draft = service.buildDraft(restaurant, products, request);
        if (!verifyAcceptanceToken(request.acceptanceToken, restaurant.id, sha256(draft))) {
          throw new ConflictException({ error: "NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE", changedQuote: draft,
            acceptanceToken: issueAcceptanceToken(restaurant.id, sha256(draft)) });
        }
        const createdAt = new Date().toISOString();
        const snapshots = draft.items.map((item) => ({ snapshotVersion: 1, mode: "NETWORK", locale: draft.locale,
          currency: draft.currency, ...item, createdAt }));
        await tx.order.update({ where: { id: claimed.id }, data: { source: "NETWORK_TEST", totalAmount: draft.totalAmount,
          customerName: draft.orderDetails.customerName, customerPhone: draft.orderDetails.customerPhone,
          cartSnapshot: { snapshotVersion: 1, mode: "NETWORK", locale: draft.locale, orderDetails: draft.orderDetails,
            totalAmount: draft.totalAmount, currency: draft.currency, items: snapshots, createdAt } } });
        await tx.orderItem.createMany({ data: snapshots.map((item) => ({ orderId: claimed.id, productId: item.productId,
          name: item.productName, quantity: item.quantity, note: item.note, unitPrice: item.unitPrice,
          totalPrice: item.lineTotal, options: item })) });
        await tx.order.update({ where: { id: claimed.id }, data: { networkSnapshotSealedAt: new Date() } });
        if (fault === "before_commit_timeout") throw new Error("POC_SIMULATED_TIMEOUT_BEFORE_COMMIT");
        return { orderId: claimed.id, totalAmount: draft.totalAmount, currency: draft.currency,
          status: "VALIDATED_TEST", replayed: false, orderingEnabled: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
      return { status: 201, body: result, retries };
    } catch (error) {
      if (isSerialization(error)) {
        retries++;
        if (attempt < 2) continue;
        return { status: 409, body: { error: "NETWORK_ORDER_CONCURRENT_UPDATE" }, retries };
      }
      if (error?.code === "P2002") {
        // Fresh transaction AFTER the unique-index winner has committed. Tenant-scoped, sealed, hash-bound replay only.
        const found = await db.$transaction(async (tx) => {
          const tenant = await tx.restaurant.findFirst({ where: { slug, isActive: true, deletedAt: null }, select: { id: true } });
          if (!tenant) return { status: 404, body: { error: "RESTAURANT_NOT_FOUND" } };
          const existing = await tx.order.findUnique({ where: { restaurantId_idempotencyKey: {
            restaurantId: tenant.id, idempotencyKey: request.idempotencyKey } } });
          if (existing) {
            if (existing.requestHash !== requestHash || existing.source !== "NETWORK_TEST" || !existing.networkSnapshotSealedAt) {
              return { status: 409, body: { error: "IDEMPOTENCY_KEY_REUSED" } };
            }
            return { status: 201, body: { orderId: existing.id, totalAmount: existing.totalAmount.toString(),
              currency: existing.currency, status: existing.status, replayed: true, orderingEnabled: false } };
          }
          const tokenOwner = await tx.order.findUnique({ where: { restaurantId_acceptanceTokenHash: {
            restaurantId: tenant.id, acceptanceTokenHash } } });
          return { status: 409, body: { error: tokenOwner ? "ACCEPTANCE_TOKEN_ALREADY_USED" : "CLAIM_CONFLICT_NOT_VISIBLE" } };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return { ...found, retries };
      }
      if (typeof error?.getStatus === "function") return { status: error.getStatus(), body: error.getResponse(), retries };
      if (error?.message === "POC_SIMULATED_TIMEOUT_BEFORE_COMMIT") return { status: 599, body: { error: error.message }, retries };
      throw error;
    }
  }
}

async function startServers() {
  class TestModule {}
  Module({ controllers: [NetworkOrdersController], providers: [NetworkOrdersService, NetworkOrderLoopbackGuard,
    { provide: PrismaService, useValue: db }] })(TestModule);
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  runtimeOrigin = await app.getUrl();
  pocServer = createServer(async (req, res) => {
    if (req.socket.remoteAddress !== "127.0.0.1" || req.method !== "POST" || !/^\/poc\/c3c-[0-4]\/create$/.test(req.url ?? "")) {
      res.writeHead(403).end(); return;
    }
    try {
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 256_000) throw new Error("POC_BODY_TOO_LARGE"); }
      const output = await atomicCreate(req.url.split("/")[2], JSON.parse(body));
      res.writeHead(output.status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(output));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "POC_INTERNAL_ERROR" }));
    }
  });
  await new Promise((resolve) => pocServer.listen(0, "127.0.0.1", resolve));
  pocOrigin = `http://127.0.0.1:${pocServer.address().port}`;
}

async function post(origin, path, body) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  return { status: response.status, body: await response.json(), latency: performance.now() - started };
}
async function prepare(t, note) {
  const body = { locale: "en", items: [{ productId: t.productId, quantity: 1, selection: selection(t.productId) }], orderNote: note };
  const response = await post(runtimeOrigin, `/public/menus/${t.slug}/orders/network-test/prepare`, body);
  if (response.status !== 200) throw new Error(`Prepare failed: ${response.status} ${response.body.error}`);
  return { slug: t.slug, body: { ...body, acceptanceToken: response.body.acceptanceToken, idempotencyKey: randomUUID() } };
}
async function execute(variant, entry) {
  const origin = variant === "current" ? runtimeOrigin : pocOrigin;
  const path = variant === "current" ? `/public/menus/${entry.slug}/orders/network-test/`
    : `/poc/${entry.slug}/create`;
  const response = await post(origin, path, entry.body);
  if (variant === "atomic") {
    response.retries = response.body.retries;
    response.body = response.body.body;
  }
  if (![201, 404, 409].includes(response.status)) throw new Error(`${variant} unexpected HTTP ${response.status}: ${response.body.error}`);
  return response;
}

async function httpWave(variant, mode, concurrent) {
  const entries = [];
  for (let i = 0; i < concurrent; i++) {
    const t = mode === "tenants" ? tenants[i % tenants.length] : tenants[0];
    entries.push(await prepare(t, `${variant}-${mode}-${concurrent}-${i}-${randomUUID()}`));
  }
  if (mode === "same_key_same_payload") for (let i = 1; i < entries.length; i++) entries[i] = structuredClone(entries[0]);
  if (mode === "same_key_changed_payload") for (let i = 1; i < entries.length; i++) entries[i].body.idempotencyKey = entries[0].body.idempotencyKey;
  if (mode === "same_token_new_keys") for (let i = 1; i < entries.length; i++) {
    // Token is bound to the draft, so same-token attempts use the same draft but distinct idempotency keys.
    entries[i] = { slug: entries[0].slug, body: { ...structuredClone(entries[0].body), idempotencyKey: randomUUID() } };
  }
  const before = await db.order.count({ where: { source: "NETWORK_TEST" } });
  const responses = await Promise.all(entries.map((e) => execute(variant, e)));
  const after = await db.order.count({ where: { source: "NETWORK_TEST" } });
  const created = responses.filter((r) => r.status === 201 && r.body.replayed === false);
  const replayed = responses.filter((r) => r.status === 201 && r.body.replayed === true);
  const conflicts = responses.filter((r) => r.status === 409);
  if (after - before !== created.length || (mode.startsWith("same_") && created.length > 1)) throw new Error(`${variant}/${mode}: duplicate or missing Order`);
  const ids = [...new Set(created.map((r) => r.body.orderId))];
  const saved = await db.order.findMany({ where: { id: { in: ids } }, include: { items: true } });
  if (saved.length !== ids.length || saved.some((o) => o.totalAmount.toString() !== "100.000001"
    || o.cartSnapshot?.totalAmount !== "100.000001" || o.items.length !== 1 || !o.networkSnapshotSealedAt)) {
    throw new Error(`${variant}/${mode}: untrusted total or unsealed snapshot`);
  }
  const row = { variant, mode, concurrency: concurrent, created: created.length, replayed: replayed.length,
    conflicts: conflicts.length, conflictCodes: Object.fromEntries([...new Set(conflicts.map((r) => r.body.error))].map((x) => [x,
      conflicts.filter((r) => r.body.error === x).length])), pocRetries: variant === "atomic"
      ? responses.reduce((n, r) => n + (r.retries ?? 0), 0) : null,
    latency: sum(responses.map((r) => r.latency)) };
  metrics.http.push(row); process.stdout.write(`HTTP ${JSON.stringify(row)}\n`);
  return row;
}

async function sqlWave(mode, concurrent, tenantSpread = false) {
  const prefix = `sql-${mode}-${randomUUID()}`;
  const observations = await Promise.all(Array.from({ length: concurrent }, async (_, i) => {
    const tenant = tenantSpread ? tenants[i % tenants.length] : tenants[0];
    const key = `${prefix}-${i}`, token = `${prefix}-token-${i}`;
    const started = performance.now();
    try {
      await db.$transaction(async (tx) => {
        if (mode === "read_before_insert") {
          await tx.order.findUnique({ where: { restaurantId_idempotencyKey: { restaurantId: tenant.id, idempotencyKey: key } } });
          await tx.order.findUnique({ where: { restaurantId_acceptanceTokenHash: { restaurantId: tenant.id, acceptanceTokenHash: token } } });
        }
        if (mode === "on_conflict") {
          await tx.$queryRaw`INSERT INTO "Order" ("id", "restaurantId", "totalAmount", "currency", "status", "source", "idempotencyKey", "acceptanceTokenHash")
            VALUES (${randomUUID()}, ${tenant.id}, 0, 'EGP', 'VALIDATED_TEST', 'DIAGNOSTIC', ${key}, ${token}) ON CONFLICT DO NOTHING RETURNING "id"`;
        } else {
          await tx.order.create({ data: { restaurantId: tenant.id, totalAmount: "0", currency: "EGP", status: "VALIDATED_TEST",
            source: "DIAGNOSTIC", idempotencyKey: key, acceptanceTokenHash: token } });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
      return { code: "ok", latency: performance.now() - started };
    } catch (error) { return { code: error.code ?? "unknown", sqlstate: error.meta?.code, latency: performance.now() - started }; }
  }));
  const row = { mode, concurrency: concurrent, tenantSpread,
    codes: Object.fromEntries([...new Set(observations.map((o) => o.code))].map((x) => [x, observations.filter((o) => o.code === x).length])),
    sqlstates: [...new Set(observations.map((o) => o.sqlstate).filter(Boolean))], latency: sum(observations.map((o) => o.latency)) };
  metrics.sql.push(row); process.stdout.write(`SQL ${JSON.stringify(row)}\n`);
}

async function sqlDuplicateWave(mode, concurrent) {
  const key = `duplicate-${randomUUID()}`, token = `token-${randomUUID()}`;
  const observations = await Promise.all(Array.from({ length: concurrent }, async () => {
    try {
      return await db.$transaction(async (tx) => {
        if (mode === "on_conflict") {
          const rows = await tx.$queryRaw`INSERT INTO "Order" ("id", "restaurantId", "totalAmount", "currency", "status", "source", "idempotencyKey", "acceptanceTokenHash")
            VALUES (${randomUUID()}, ${tenants[0].id}, 0, 'EGP', 'VALIDATED_TEST', 'DIAGNOSTIC', ${key}, ${token}) ON CONFLICT DO NOTHING RETURNING "id"`;
          return rows.length ? "claimed" : "existing";
        }
        await tx.order.create({ data: { restaurantId: tenants[0].id, totalAmount: "0", currency: "EGP",
          status: "VALIDATED_TEST", source: "DIAGNOSTIC", idempotencyKey: key, acceptanceTokenHash: token } });
        return "claimed";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
    } catch (error) { return `${error.code ?? "unknown"}${error.meta?.code ? `:${error.meta.code}` : ""}`; }
  }));
  const saved = await db.order.count({ where: { restaurantId: tenants[0].id, idempotencyKey: key } });
  if (saved !== 1) throw new Error("SQL duplicate key created zero or multiple Orders");
  const row = { mode: `${mode}_duplicate_key`, concurrency: concurrent,
    codes: Object.fromEntries([...new Set(observations)].map((x) => [x, observations.filter((o) => o === x).length])), saved };
  metrics.sql.push(row); process.stdout.write(`SQL ${JSON.stringify(row)}\n`);
}

async function predicateLocks() {
  const observed = {};
  for (const mode of ["read_before_insert", "atomic_insert"]) {
    observed[mode] = await db.$transaction(async (tx) => {
      if (mode === "read_before_insert") {
        await tx.order.findUnique({ where: { restaurantId_idempotencyKey: { restaurantId: tenants[0].id,
          idempotencyKey: `absent-${randomUUID()}` } } });
        await tx.order.findUnique({ where: { restaurantId_acceptanceTokenHash: { restaurantId: tenants[0].id,
          acceptanceTokenHash: `absent-${randomUUID()}` } } });
      } else {
        await tx.order.create({ data: { restaurantId: tenants[0].id, totalAmount: "0", currency: "EGP",
          status: "VALIDATED_TEST", source: "DIAGNOSTIC", idempotencyKey: randomUUID(), acceptanceTokenHash: randomUUID() } });
      }
      return tx.$queryRaw`SELECT c.relname AS relation, l.mode, count(*)::int AS count FROM pg_locks l
        JOIN pg_class c ON c.oid = l.relation WHERE l.pid = pg_backend_pid() AND l.mode = 'SIReadLock'
        GROUP BY c.relname, l.mode ORDER BY c.relname`;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  process.stdout.write(`PREDICATE_LOCKS ${JSON.stringify(observed)}\n`);
}

async function safety() {
  const t = tenants[0];
  const first = await prepare(t, `safety-${randomUUID()}`);
  const accepted = await execute("atomic", first);
  const same = await execute("atomic", first); // Simulates lost response after successful COMMIT.
  const altered = await execute("atomic", { ...first, body: { ...first.body, orderNote: "changed" } });
  const tokenReused = await execute("atomic", { ...first, body: { ...first.body, idempotencyKey: randomUUID() } });
  if (accepted.status !== 201 || same.body.orderId !== accepted.body.orderId || same.body.replayed !== true
    || altered.body.error !== "IDEMPOTENCY_KEY_REUSED" || tokenReused.body.error !== "ACCEPTANCE_TOKEN_ALREADY_USED") {
    throw new Error("Atomic replay/payload/token safety failed");
  }
  metrics.safety.push({ case: "commit_response_lost_and_retry", replaySameOrder: true, changedPayloadRejected: true, tokenReuseRejected: true });

  const rolled = await prepare(t, `rollback-${randomUUID()}`);
  const failed = await atomicCreate(t.slug, rolled.body, "before_commit_timeout");
  const countAfterRollback = await db.order.count({ where: { restaurantId: t.id, idempotencyKey: rolled.body.idempotencyKey } });
  const retry = await execute("atomic", rolled);
  if (failed.status !== 599 || countAfterRollback !== 0 || retry.status !== 201 || retry.body.replayed) throw new Error("Timeout-before-commit rollback failed");
  metrics.safety.push({ case: "simulated_timeout_before_commit", rolledBack: true, retryCreatedExactlyOne: true });

  const stale = await prepare(t, `stale-${randomUUID()}`);
  const historical = await db.order.findUnique({ where: { id: accepted.body.orderId }, select: { cartSnapshot: true, totalAmount: true } });
  await db.product.update({ where: { id: t.productId }, data: { configurationTree: config(t.productId, 2, "101.000001"), configurationVersion: 2 } });
  const old = await execute("atomic", stale);
  const historicalReplay = await execute("atomic", first);
  const oldCount = await db.order.count({ where: { restaurantId: t.id, idempotencyKey: stale.body.idempotencyKey } });
  if (old.status !== 409 || oldCount !== 0 || !["CONFIGURATION_REVISION_CHANGED", "NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE"].includes(old.body.error)) {
    throw new Error("Stale price/revision accepted");
  }
  if (historicalReplay.status !== 201 || !historicalReplay.body.replayed
    || historicalReplay.body.orderId !== accepted.body.orderId) throw new Error("Committed idempotent replay lost after catalog change");
  const historicalAfter = await db.order.findUnique({ where: { id: accepted.body.orderId }, select: { cartSnapshot: true, totalAmount: true } });
  if (JSON.stringify(historical.cartSnapshot) !== JSON.stringify(historicalAfter.cartSnapshot)
    || historical.totalAmount.toString() !== historicalAfter.totalAmount.toString()) throw new Error("Sealed Snapshot changed with catalog");
  metrics.safety.push({ case: "stale_revision_and_price", rejected: old.body.error, persisted: oldCount });
  metrics.safety.push({ case: "historical_snapshot_after_product_change", unchanged: true, replayedAfterChange: true });
  await db.product.update({ where: { id: t.productId }, data: { configurationTree: config(t.productId), configurationVersion: 1 } });

  const cross = await prepare(t, `cross-${randomUUID()}`);
  const crossTenant = await execute("atomic", { slug: tenants[1].slug, body: cross.body });
  const crossDraft = await service.prepare(t.slug, { locale: cross.body.locale, items: cross.body.items, orderNote: cross.body.orderNote });
  const digest = sha256(crossDraft.draft);
  const tenantBindingRejected = verifyAcceptanceToken(crossDraft.acceptanceToken, t.id, digest)
    && !verifyAcceptanceToken(crossDraft.acceptanceToken, tenants[1].id, digest);
  if (![400, 404, 409].includes(crossTenant.status) || crossTenant.body.orderId || !tenantBindingRejected) throw new Error("Cross-tenant token accepted");
  metrics.safety.push({ case: "cross_tenant_token", rejected: crossTenant.body.error, status: crossTenant.status,
    hmacTenantBindingRejected: tenantBindingRejected });

  const priceOnly = await prepare(t, `price-only-${randomUUID()}`);
  await db.product.update({ where: { id: t.productId }, data: { configurationTree: config(t.productId, 1, "102.000001") } });
  const changedPrice = await execute("atomic", priceOnly);
  const priceOrders = await db.order.count({ where: { restaurantId: t.id, idempotencyKey: priceOnly.body.idempotencyKey } });
  if (changedPrice.status !== 409 || changedPrice.body.error !== "NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE" || priceOrders !== 0) {
    throw new Error("Changed price was accepted without new approval");
  }
  metrics.safety.push({ case: "price_changed_without_revision_fixture", rejected: changedPrice.body.error, persisted: priceOrders });

  // This is a deliberate negative finding: existing Stage 6C constraints do not prohibit a committed POC_PENDING row.
  const pending = await db.order.create({ data: { restaurantId: t.id, totalAmount: "0", currency: "EGP",
    status: "VALIDATED_TEST", source: "POC_PENDING", idempotencyKey: randomUUID(),
    requestHash: randomUUID(), acceptanceTokenHash: randomUUID() } });
  const pendingCommitted = !!await db.order.findUnique({ where: { id: pending.id } });
  await db.order.delete({ where: { id: pending.id } });
  if (!pendingCommitted) throw new Error("Pending-commit negative control not reproduced");
  metrics.safety.push({ case: "unsealed_pending_row_negative_control", existingSchemaPermitsCommit: true,
    productionAdoptionBlocked: true });
}

try {
  await db.$connect();
  const environment = await verifyTarget();
  await seed();
  await startServers();
  for (const n of [1, 5, 10, 25]) {
    for (const mode of ["read_before_insert", "atomic_insert", "on_conflict"]) await sqlWave(mode, n);
  }
  await sqlWave("read_before_insert", 25, true);
  await sqlWave("atomic_insert", 25, true);
  for (const n of [5, 25]) {
    await sqlDuplicateWave("atomic_insert", n);
    await sqlDuplicateWave("on_conflict", n);
  }
  await predicateLocks();
  for (const variant of ["current", "atomic"]) {
    for (const n of [1, 5, 10, 25]) {
      for (const mode of ["distinct", "tenants", "same_key_same_payload", "same_key_changed_payload", "same_token_new_keys"]) {
        await httpWave(variant, mode, n);
      }
    }
  }
  await safety();
  process.stdout.write(`STAGE6D3C3C_RESULT=${JSON.stringify({ environment, sqlWaves: metrics.sql.length,
    httpWaves: metrics.http.length, safety: metrics.safety })}\n`);
} finally {
  if (pocServer) await new Promise((resolve) => pocServer.close(resolve));
  if (app) await app.close();
  await db.$disconnect();
}
