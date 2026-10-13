/**
 * Manual, bounded Stage 6D.3C3 benchmark. Run only after building Shared and API.
 * Requires a NEW PostgreSQL database at the exact URL checked below; never loads .env.
 * This file is intentionally excluded from the ordinary test suite.
 */
import { createRequire } from "node:module";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
require("reflect-metadata");
const { Module } = require("@nestjs/common");
const { ConfigService } = require("@nestjs/config");
const { NestFactory } = require("@nestjs/core");
const { PrismaClient } = require("@prisma/client");
const { PrismaService } = require("../apps/api/dist/modules/prisma/prisma.service.js");
const { FeatureFlagsService } = require("../apps/api/dist/modules/feature-flags/feature-flags.service.js");
const { PublicMenuService } = require("../apps/api/dist/modules/public-menu/public-menu.service.js");
const { PublicMenuController } = require("../apps/api/dist/modules/public-menu/public-menu.controller.js");
const { NetworkOrdersService } = require("../apps/api/dist/modules/orders/network-orders.service.js");
const { NetworkOrdersController, NetworkOrderLoopbackGuard } = require("../apps/api/dist/modules/orders/network-orders.controller.js");
const { multiplyMoney } = require("@menu/shared");

const runtimeGuardMode = process.env.STAGE6D3C3F_RUNTIME_GUARD_BENCH === "1";
const exactDatabase = runtimeGuardMode
  ? `ordersawa_stage3_stage6c_stage6d3c3f_${process.env.STAGE6D3C3F_BENCH_RUN === "2" ? "bench2" : "bench"}`
  : "ordersawa_stage3_stage6c_stage6d3c3_bench";
const databaseUrl = runtimeGuardMode ? process.env.STAGE6D3C3F_DATABASE_URL : process.env.STAGE6D3C3_DATABASE_URL;
if (!databaseUrl || process.env.NODE_ENV === "production" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1") {
  throw new Error("Stage 6D.3C3 requires an explicit disposable URL, non-Production mode, and the test-only order flag");
}
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55440" || parsed.pathname !== `/${exactDatabase}`) {
  throw new Error("Stage 6D.3C3 refuses a non-disposable database URL");
}

const restaurantId = "s6d3c3-restaurant";
const slug = "s6d3c3";
const pizzaId = "s6d3c3-pizza";
const sourceId = "s6d3c3-source";
const comboId = "s6d3c3-combo";
const unrelatedId = "s6d3c3-unrelated";
const otherRestaurant = "s6d3c3-other";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const limitMs = 45_000;
const rssLimitMb = 1_200;
const onlySize = process.env.STAGE6D3C3_ONLY_SIZE;
const diagnosticMode = process.env.STAGE6D3C3_DIAG === "1";
if (onlySize && !["10", "100", "1000", "10000"].includes(onlySize)) {
  throw new Error("STAGE6D3C3_ONLY_SIZE must be one approved bounded catalog size");
}
const result = { environment: {}, catalog: [], concurrency: [], complex: [], locking: [], correctness: [], stopped: null };

const pizza = { schemaVersion: 1, productId: pizzaId, revision: 1, basePrice: null, groups: [
  { type: "SIZE", id: "sizes", label: "Sizes", sizes: [
    { id: "small", label: "Small", price: "100" },
    { id: "medium", label: "Medium", price: "200.000001" },
    { id: "large", label: "Large", price: "300" }
  ] },
  { type: "OPTIONS", id: "toppings", label: "Toppings", min: 0, max: 3, includedQuantity: 1,
    options: [{ id: "cheese", label: "Cheese", price: "30.000001", maxQuantity: 3,
      children: [{ type: "OPTIONS", id: "sauces", label: "Sauces", min: 0, max: 1, includedQuantity: 0,
        options: [{ id: "bbq", label: "BBQ", price: "5.000001", maxQuantity: 1 }] }] }] }
] };
const source = { schemaVersion: 1, productId: sourceId, revision: 1, basePrice: null, groups: [
  { type: "SIZE", id: "source-sizes", label: "Source Sizes", sizes: [
    { id: "source-small", label: "Small", price: "100" },
    { id: "source-large", label: "Large", price: "200" }
  ] }
] };
const combo = { schemaVersion: 1, productId: comboId, revision: 1, basePrice: "0", groups: [
  { type: "OPTIONS", id: "slots", label: "Combo Slots", min: 3, max: 3, includedQuantity: 0, options: [
    { id: "original", label: "Original Pizza", price: "10", maxQuantity: 2,
      linkedProduct: { sourceProductId: sourceId, mode: "ORIGINAL", originalPriceOverrides: { "source-small": "5", "source-large": "8" } } },
    { id: "custom", label: "Custom Pizza", price: "3", maxQuantity: 1,
      linkedProduct: { sourceProductId: sourceId, mode: "CUSTOM", customConfiguration: {
        schemaVersion: 1, productId: sourceId, revision: 1, basePrice: null, groups: [
          { type: "SIZE", id: "custom-sizes", label: "Custom Sizes", sizes: [{ id: "custom-medium", label: "Medium", price: "7" }] }
        ]
      } } }
  ] }
] };
const pizzaSelection = { schemaVersion: 1, productId: pizzaId, configurationRevision: 1, groups: [
  { type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" },
  { type: "OPTIONS", groupId: "toppings", instances: [
    { instanceId: "cheese-1", optionId: "cheese", children: [{ type: "OPTIONS", groupId: "sauces", instances: [{ instanceId: "sauce-1", optionId: "bbq" }] }] },
    { instanceId: "cheese-2", optionId: "cheese" },
    { instanceId: "cheese-3", optionId: "cheese" }
  ] }
] };
const comboSelection = { schemaVersion: 1, productId: comboId, configurationRevision: 1, groups: [
  { type: "OPTIONS", groupId: "slots", instances: [
    { instanceId: "original-1", optionId: "original", linkedSelection: { schemaVersion: 1, productId: sourceId,
      configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-small" }] } },
    { instanceId: "original-2", optionId: "original", linkedSelection: { schemaVersion: 1, productId: sourceId,
      configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-large" }] } },
    { instanceId: "custom-1", optionId: "custom", linkedSelection: { schemaVersion: 1, productId: sourceId,
      configurationRevision: 1, groups: [{ type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-medium" }] } }
  ] }
] };

const cases = {
  pizza: { productId: pizzaId, selection: pizzaSelection, total: "265.000004" },
  combo: { productId: comboId, selection: comboSelection, total: "43" }
};
const fifty = { lines: Array.from({ length: 50 }, () => ({ productId: pizzaId, quantity: 1, selection: pizzaSelection })),
  total: multiplyMoney(cases.pizza.total, 50) };
const ten = { lines: fifty.lines.slice(0, 10), total: multiplyMoney(cases.pizza.total, 10) };

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? +sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(2) : null;
}
function summary(values) {
  return { median: percentile(values, 0.5), p95: values.length >= 20 ? percentile(values, 0.95) : null,
    max: percentile(values, 1) };
}
function median(values) { return summary(values).median; }
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [{ emit: "event", level: "query" }] });
const observer = new PrismaClient({ datasourceUrl: databaseUrl });
let app;
let origin;
let active = null;
let hold = null;

prisma.$on("query", (event) => {
  if (!active) return;
  active.queries += 1;
  active.queryMs += event.duration;
  if (/FOR SHARE/i.test(event.query)) active.forShare += 1;
});

const db = new Proxy(prisma, { get(target, key) {
  if (key === "$transaction") return async (work, options) => {
    const began = performance.now();
    let callbackReturned = false;
    if (active) active.transactions += 1;
    try {
      return await target.$transaction(async (transaction) => {
        const value = await work(transaction);
        callbackReturned = true;
        if (hold) {
          const latch = hold;
          latch.arrivals += 1;
          if (latch.arrivals >= latch.expected) latch.arrived();
          await latch.releasePromise;
        }
        return value;
      }, options);
    } catch (error) {
      if (active) {
        const code = String(error?.code ?? "UNKNOWN");
        const stage = callbackReturned ? "commit_or_after_callback" : "statement_or_callback";
        active.errorCodes[code] = (active.errorCodes[code] ?? 0) + 1;
        active.errorStages[stage] = (active.errorStages[stage] ?? 0) + 1;
      }
      if (active && (error?.code === "P2034" || (error?.code === "P2010" && ["40001", "40P01"].includes(error.meta?.code)))) {
        active.serializationConflicts += 1;
      }
      throw error;
    } finally {
      if (active) active.transactionMs.push(performance.now() - began);
    }
  };
  const value = Reflect.get(target, key, target);
  return typeof value === "function" ? value.bind(target) : value;
} });

async function verifyTarget() {
  const [row] = await observer.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address,
    inet_server_port() AS port, version() AS version`;
  if (row?.name !== exactDatabase || row.address !== "127.0.0.1" || row.port !== 55440) {
    throw new Error("Actual database identity does not match the dedicated disposable target");
  }
  const existing = await observer.restaurant.count();
  if (existing !== 0) throw new Error("Benchmark refuses a database with pre-existing Restaurant rows; create a new disposable database");
  result.environment = { node: process.version, platform: process.platform, arch: process.arch,
    logicalCpus: os.cpus().length, totalMemoryGb: +(os.totalmem() / 1024 ** 3).toFixed(2),
    postgresql: row.version, database: row.name, address: row.address, port: row.port,
    nodeOldSpaceLimit: "not explicitly set", requestTimeoutMs: limitMs, rssStopMb: rssLimitMb };
}

async function seedBase() {
  await observer.restaurant.createMany({ data: [
    { id: restaurantId, slug, name: "Benchmark restaurant", currency: "EGP" },
    { id: otherRestaurant, slug: "s6d3c3-other", name: "Other benchmark tenant", currency: "EGP" }
  ] });
  await observer.subscriptionPlan.create({ data: { id: "s6d3c3-plan", key: "S6D3C3_TEST", name: "Benchmark plan",
    features: { create: { id: "s6d3c3-feature", key: "PRODUCT_CONFIGURATION", enabled: true } } } });
  await observer.restaurantSubscription.create({ data: { id: "s6d3c3-sub", restaurantId,
    planId: "s6d3c3-plan", status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z") } });
  await observer.product.createMany({ data: [
    { id: pizzaId, restaurantId, slug: "pizza", name: "Pizza", currency: "EGP", basePrice: null,
      configurationVersion: 1, configurationTree: pizza },
    { id: sourceId, restaurantId, slug: "source", name: "Linked source", currency: "EGP", basePrice: null,
      configurationVersion: 1, configurationTree: source },
    { id: comboId, restaurantId, slug: "combo", name: "Combo", currency: "EGP", basePrice: "0",
      configurationVersion: 1, configurationTree: combo },
    { id: unrelatedId, restaurantId, slug: "unrelated", name: "Unrelated product B", currency: "EGP", basePrice: "1" },
    { id: "s6d3c3-foreign", restaurantId: otherRestaurant, slug: "foreign", name: "Foreign", currency: "EGP", basePrice: "1" }
  ] });
  class BenchmarkModule {}
  Module({ controllers: [PublicMenuController, NetworkOrdersController], providers: [
    PublicMenuService, FeatureFlagsService, NetworkOrdersService, NetworkOrderLoopbackGuard,
    { provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: { get: () => undefined } }
  ] })(BenchmarkModule);
  app = await NestFactory.create(BenchmarkModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
}

async function growCatalog(target, tenantId = restaurantId) {
  const current = await observer.product.count({ where: { restaurantId: tenantId } });
  const started = performance.now();
  for (let index = current; index < target; index += 500) {
    const batch = Array.from({ length: Math.min(500, target - index) }, (_, offset) => {
      const id = `s6d3c3-legacy-${tenantId}-${index + offset}`;
      return { id, restaurantId: tenantId, slug: id, name: `Legacy ${index + offset}`, currency: "EGP", basePrice: "1" };
    });
    await observer.product.createMany({ data: batch });
  }
  const actual = await observer.product.count({ where: { restaurantId: tenantId } });
  if (actual !== target) throw new Error(`Fixture count ${actual} differs from target ${target}`);
  return +(performance.now() - started).toFixed(2);
}

async function post(path, body) {
  const started = performance.now();
  try {
    const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(limitMs) });
    return { duration: performance.now() - started, status: response.status, body: await response.json() };
  } catch (error) {
    return { duration: performance.now() - started, status: -1, body: { error: String(error?.name ?? error) } };
  }
}

function payload(kind, scenario, index) {
  const chosen = scenario === "combo" ? cases.combo : cases.pizza;
  const lines = scenario === "fifty" ? fifty.lines : scenario === "ten" ? ten.lines
    : [{ productId: chosen.productId, quantity: 1, selection: chosen.selection }];
  if (kind === "quote") return { path: `/public/menus/${slug}/products/${chosen.productId}/quote`, body: { selection: chosen.selection }, total: chosen.total };
  const body = { locale: "en", items: lines, orderNote: `Benchmark ${index}-${randomUUID()}` };
  return { path: `/public/menus/${slug}/orders/network-test/${kind === "prepare" ? "prepare" : ""}`, body,
    total: scenario === "fifty" ? fifty.total : scenario === "ten" ? ten.total : chosen.total };
}

async function activitySampler(stop) {
  const peak = { connections: 0, lockWaiting: 0, rssMb: 0, heapMb: 0 };
  while (!stop.done) {
    try {
      const [row] = await observer.$queryRaw`SELECT count(*)::int AS connections,
        count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS waiting
        FROM pg_stat_activity WHERE datname = current_database()`;
      peak.connections = Math.max(peak.connections, row.connections);
      peak.lockWaiting = Math.max(peak.lockWaiting, row.waiting);
    } catch { /* Sampler must not change a request result; failures are reported as missing samples. */ }
    peak.rssMb = Math.max(peak.rssMb, process.memoryUsage().rss / 1024 ** 2);
    peak.heapMb = Math.max(peak.heapMb, process.memoryUsage().heapUsed / 1024 ** 2);
    await pause(25);
  }
  return peak;
}

async function wave(kind, scenario, count, label, measure = true, requestFactory = payload) {
  const requests = Array.from({ length: count }, (_, index) => requestFactory(kind, scenario, index));
  if (kind === "create") {
    for (const request of requests) {
      const prepared = await post(`${request.path}prepare`, request.body);
      if (prepared.status !== 200) throw new Error(`Create setup Prepare failed: ${prepared.status} ${prepared.body.error}`);
      request.body = { ...request.body, acceptanceToken: prepared.body.acceptanceToken, idempotencyKey: randomUUID() };
    }
  }
  const orderCountBefore = await observer.order.count({ where: { source: "NETWORK_TEST" } });
  const metrics = { queries: 0, queryMs: 0, forShare: 0, transactions: 0, transactionMs: [],
    serializationConflicts: 0, errorCodes: {}, errorStages: {} };
  const stop = { done: !measure };
  if (measure) active = metrics;
  const sample = measure ? activitySampler(stop) : Promise.resolve(null);
  const responses = await Promise.all(requests.map((request) => post(request.path, request.body)));
  stop.done = true;
  const peak = await sample;
  await pause(20); // Let Prisma query-log events from the completed wave flush.
  active = null;
  const accepted = [];
  const conflicts = [];
  for (const [index, response] of responses.entries()) {
    const expected = requests[index].total;
    const total = kind === "quote" ? response.body.trustedTotal
      : kind === "prepare" ? response.body.draft?.totalAmount : response.body.totalAmount;
    if (response.status === (kind === "create" ? 201 : 200)
      && total === expected && response.body.orderingEnabled === false) {
      accepted.push(response);
    } else if ((kind === "prepare" || kind === "create") && response.status === 409
      && response.body.error === "NETWORK_ORDER_CONCURRENT_UPDATE"
      && response.body.orderId === undefined) {
      conflicts.push(response);
    } else {
      throw new Error(`${label}: ${kind} unsafe or unexpected response: HTTP ${response.status}, total ${total}, error ${response.body.error}`);
    }
  }
  const orderCountAfter = await observer.order.count({ where: { source: "NETWORK_TEST" } });
  if (orderCountAfter - orderCountBefore !== (kind === "create" ? accepted.length : 0)) {
    throw new Error(`${label}: unexpected number of persisted Orders`);
  }
  if (kind === "create") {
    const ids = accepted.map((response) => response.body.orderId);
    if (new Set(ids).size !== accepted.length) throw new Error(`${label}: duplicate Order ID`);
    const saved = await observer.order.findMany({ where: { id: { in: ids }, source: "NETWORK_TEST" },
      select: { id: true, totalAmount: true, cartSnapshot: true, networkSnapshotSealedAt: true, items: { select: { options: true } } } });
    const expectedByOrder = new Map(responses.flatMap((response, index) => response.body.orderId
      ? [[response.body.orderId, requests[index].total]] : []));
    if (saved.length !== accepted.length || saved.some((order) => order.totalAmount.toString() !== expectedByOrder.get(order.id)
      || !order.networkSnapshotSealedAt || order.items.length !== (scenario === "fifty" ? 50 : scenario === "ten" ? 10 : 1)
      || order.cartSnapshot?.totalAmount !== expectedByOrder.get(order.id))) throw new Error(`${label}: saved Snapshot mismatch`);
    if (scenario === "combo" && saved.some((order) => order.cartSnapshot?.items?.[0]?.canonicalSelection?.groups?.[0]?.instances?.length !== 3)) {
      throw new Error(`${label}: repeated Linked selections missing from saved Snapshot`);
    }
  }
  if (!measure) return null;
  const latencies = responses.map((response) => response.duration);
  const row = { label, kind, scenario, concurrency: count, samples: count, success: accepted.length,
    latencyMs: summary(latencies), queryCount: metrics.queries, queriesPerRequest: +(metrics.queries / count).toFixed(2),
    prismaQueryMsTotal: +metrics.queryMs.toFixed(2), forShareQueries: metrics.forShare,
    transactionAttempts: metrics.transactions, transactionMs: summary(metrics.transactionMs),
    transactionDurations: metrics.transactionMs,
    serializationConflicts: metrics.serializationConflicts, httpConflicts: conflicts.length,
    errorCodes: metrics.errorCodes, errorStages: metrics.errorStages,
    peakConnections: peak.connections, peakLockWaiting: peak.lockWaiting,
    peakRssMb: +peak.rssMb.toFixed(1), peakHeapMb: +peak.heapMb.toFixed(1), latencies };
  if (row.peakRssMb > rssLimitMb || row.latencyMs.max > limitMs * 0.8) {
    result.stopped = `Resource/latency threshold reached at ${label}: ${row.peakRssMb} MB RSS, ${row.latencyMs.max} ms maximum`;
  }
  return row;
}

async function series(kind, scenario, catalog, concurrency, waves, requestFactory = payload) {
  await wave(kind, scenario, concurrency, `warmup-${catalog}-${kind}-${scenario}-${concurrency}`, false, requestFactory);
  const rows = [];
  for (let index = 0; index < waves && !result.stopped; index += 1) {
    rows.push(await wave(kind, scenario, concurrency, `${catalog}-${kind}-${scenario}-${concurrency}-${index}`, true, requestFactory));
  }
  const all = rows.filter(Boolean);
  if (!all.length) return null;
  const combined = { catalog, kind, scenario, concurrency, samples: all.reduce((sum, row) => sum + row.samples, 0),
    success: all.reduce((sum, row) => sum + row.success, 0),
    httpConflicts: all.reduce((sum, row) => sum + row.httpConflicts, 0),
    serializationConflicts: all.reduce((sum, row) => sum + row.serializationConflicts, 0),
    errorCodes: Object.fromEntries([...new Set(all.flatMap((row) => Object.keys(row.errorCodes)))].map((code) =>
      [code, all.reduce((sum, row) => sum + (row.errorCodes[code] ?? 0), 0)])),
    errorStages: Object.fromEntries([...new Set(all.flatMap((row) => Object.keys(row.errorStages)))].map((stage) =>
      [stage, all.reduce((sum, row) => sum + (row.errorStages[stage] ?? 0), 0)])),
    latencyMs: summary(all.flatMap((row) => row.latencies)),
    avgQueriesPerRequest: +(all.reduce((sum, row) => sum + row.queryCount, 0) / all.reduce((sum, row) => sum + row.samples, 0)).toFixed(2),
    avgPrismaQueryMsPerRequest: +(all.reduce((sum, row) => sum + row.prismaQueryMsTotal, 0) / all.reduce((sum, row) => sum + row.samples, 0)).toFixed(2),
    avgForShareQueriesPerRequest: +(all.reduce((sum, row) => sum + row.forShareQueries, 0) / all.reduce((sum, row) => sum + row.samples, 0)).toFixed(2),
    transactionMs: summary(all.flatMap((row) => row.transactionDurations)),
    avgTransactionAttemptsPerRequest: +(all.reduce((sum, row) => sum + row.transactionAttempts, 0) / all.reduce((sum, row) => sum + row.samples, 0)).toFixed(2),
    conflicts: all.reduce((sum, row) => sum + row.serializationConflicts + row.httpConflicts, 0),
    peakConnections: Math.max(...all.map((row) => row.peakConnections)),
    peakLockWaiting: Math.max(...all.map((row) => row.peakLockWaiting)),
    peakRssMb: Math.max(...all.map((row) => row.peakRssMb)),
    peakHeapMb: Math.max(...all.map((row) => row.peakHeapMb)) };
  process.stdout.write(`${JSON.stringify({ series: combined })}\n`);
  return combined;
}

async function lockTrial(catalog, concurrency) {
  const baseline = [];
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now();
    await observer.product.update({ where: { id: unrelatedId }, data: { description: `baseline-${catalog}-${index}` } });
    baseline.push(performance.now() - started);
  }
  let arrived;
  let release;
  const arrivedPromise = new Promise((resolve) => { arrived = resolve; });
  const releasePromise = new Promise((resolve) => { release = resolve; });
  hold = { expected: concurrency, arrivals: 0, arrived, releasePromise };
  const drafts = Array.from({ length: concurrency }, (_, index) => payload("prepare", "pizza", index));
  const readers = Promise.all(drafts.map((draft) => post(draft.path, draft.body)));
  try {
    await withTimeout(arrivedPromise, 30_000, "Prepare lock acquisition");
    const writerStart = performance.now();
    const writer = Promise.resolve(observer.product.update({ where: { id: unrelatedId }, data: { description: `blocked-${catalog}-${concurrency}` } }));
    await pause(80);
    const [waitState] = await observer.$queryRaw`SELECT count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS waiting
      FROM pg_stat_activity WHERE datname = current_database()`;
    await pause(170); // Artificial 250-ms hold after the real Prepare callback acquired FOR SHARE.
    release();
    await writer;
    const writerMs = performance.now() - writerStart;
    const completed = await readers;
    const failures = completed.filter((entry) => entry.status !== 200 || entry.body.draft?.totalAmount !== cases.pizza.total);
    if (failures.length) throw new Error(`Lock trial Prepare failed: ${JSON.stringify(failures.map((entry) => entry.status))}`);
    const row = { catalog, concurrency, artificialHoldMs: 250, baselineWriterMedianMs: median(baseline),
      blockedWriterMs: +writerMs.toFixed(2), lockWaitersObserved: waitState.waiting,
      prepareMaxMs: +Math.max(...completed.map((entry) => entry.duration)).toFixed(2) };
    result.locking.push(row);
    process.stdout.write(`${JSON.stringify({ lockTrial: row })}\n`);
  } finally {
    release();
    hold = null;
    await readers;
  }
}

async function correctnessChecks() {
  const foreign = await post(`/public/menus/${slug}/products/s6d3c3-foreign/quote`, { selection: pizzaSelection });
  if (foreign.status !== 404) throw new Error(`Cross-tenant Quote unexpectedly returned ${foreign.status}`);
  const invalid = await post(`/public/menus/${slug}/orders/network-test/prepare`, {
    locale: "en", items: [{ productId: pizzaId, quantity: 1, selection: { ...pizzaSelection, configurationRevision: 999 } }]
  });
  if (invalid.status !== 409) throw new Error(`Stale selection unexpectedly returned ${invalid.status}`);
  result.correctness.push({ crossTenantQuote: foreign.status, stalePrepare: invalid.status, orderingEnabled: false });
}

const diagnosticTenants = [restaurantId, otherRestaurant, "s6d3c3-tenant-2", "s6d3c3-tenant-3", "s6d3c3-tenant-4"];
function tenantSlug(tenantId) { return tenantId === restaurantId ? slug : tenantId === otherRestaurant ? "s6d3c3-other" : tenantId; }

async function seedDiagnosticVariants() {
  await observer.restaurant.createMany({ data: diagnosticTenants.slice(2).map((id) =>
    ({ id, slug: id, name: `Diagnostic ${id}`, currency: "EGP" })) });
  await observer.restaurantSubscription.createMany({ data: diagnosticTenants.slice(1).map((id) =>
    ({ id: `${id}-sub`, restaurantId: id, planId: "s6d3c3-plan", status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z") })) });
  await observer.product.createMany({ data: [
    ...Array.from({ length: 25 }, (_, index) => {
      const id = `s6d3c3-variant-${index}`;
      return { id, restaurantId, slug: id, name: `Variant ${index}`, currency: "EGP", basePrice: null,
        configurationVersion: 1, configurationTree: { ...pizza, productId: id } };
    }),
    ...diagnosticTenants.slice(1).map((tenantId) => {
      const id = `${tenantId}-pizza`;
      return { id, restaurantId: tenantId, slug: id, name: `Pizza ${tenantId}`, currency: "EGP", basePrice: null,
        configurationVersion: 1, configurationTree: { ...pizza, productId: id } };
    })
  ] });
}

function diagnosticPayload(kind, scenario, index) {
  const request = payload(kind, "pizza", index);
  let ownerId = pizzaId;
  let restaurantSlug = slug;
  const selection = structuredClone(pizzaSelection);
  if (scenario === "different_products") ownerId = `s6d3c3-variant-${index % 25}`;
  if (scenario === "different_tenants") {
    const tenantId = diagnosticTenants[index % diagnosticTenants.length];
    restaurantSlug = tenantSlug(tenantId);
    ownerId = tenantId === restaurantId ? pizzaId : `${tenantId}-pizza`;
  }
  if (scenario === "different_selections") {
    const size = ["small", "medium", "large"][index % 3];
    selection.groups[0].sizeChoiceId = size;
    request.total = { small: "165.000003", medium: "265.000004", large: "365.000003" }[size];
  }
  selection.productId = ownerId;
  request.path = `/public/menus/${restaurantSlug}/orders/network-test/${kind === "prepare" ? "prepare" : ""}`;
  request.body.items[0] = { productId: ownerId, quantity: 1, selection };
  return request;
}

async function idempotencyProbe() {
  const draftBody = payload("prepare", "pizza", 0).body;
  const prepared = await post(`/public/menus/${slug}/orders/network-test/prepare`, draftBody);
  if (prepared.status !== 200) throw new Error(`Idempotency Prepare failed: ${prepared.status}`);
  const body = { ...draftBody, acceptanceToken: prepared.body.acceptanceToken,
    idempotencyKey: randomUUID() };
  const before = await observer.order.count({ where: { source: "NETWORK_TEST" } });
  const first = await post(`/public/menus/${slug}/orders/network-test/`, body);
  const replay = await post(`/public/menus/${slug}/orders/network-test/`, body);
  const after = await observer.order.count({ where: { source: "NETWORK_TEST" } });
  if (first.status !== 201 || replay.status !== 201 || replay.body.replayed !== true
    || first.body.orderId !== replay.body.orderId || after - before !== 1) {
    throw new Error(`Idempotency replay did not preserve a single Order: ${first.status}/${replay.status}`);
  }
  const concurrentDraftBody = payload("prepare", "pizza", 1).body;
  const concurrentPrepared = await post(`/public/menus/${slug}/orders/network-test/prepare`, concurrentDraftBody);
  if (concurrentPrepared.status !== 200) throw new Error("Concurrent idempotency Prepare failed");
  const concurrentBody = { ...concurrentDraftBody, acceptanceToken: concurrentPrepared.body.acceptanceToken,
    idempotencyKey: randomUUID() };
  const concurrentBefore = await observer.order.count({ where: { source: "NETWORK_TEST" } });
  const attempts = await Promise.all([0, 1].map(() => post(`/public/menus/${slug}/orders/network-test/`, concurrentBody)));
  const settled = await post(`/public/menus/${slug}/orders/network-test/`, concurrentBody);
  const reusedToken = await post(`/public/menus/${slug}/orders/network-test/`, {
    ...concurrentBody, idempotencyKey: randomUUID()
  });
  const concurrentAfter = await observer.order.count({ where: { source: "NETWORK_TEST" } });
  if (attempts.some((response) => ![201, 409].includes(response.status)) || settled.status !== 201
    || settled.body.replayed !== true || concurrentAfter - concurrentBefore !== 1
    || attempts.some((response) => response.status === 201 && response.body.orderId !== settled.body.orderId)
    || reusedToken.status !== 409 || reusedToken.body.error !== "ACCEPTANCE_TOKEN_ALREADY_USED") {
    throw new Error(`Concurrent idempotency/token reuse contract failed: ${attempts.map((x) => x.status)}, ${settled.status}, ${reusedToken.status}`);
  }
  const row = { first: first.status, replay: replay.status, sameOrder: true, persisted: after - before,
    concurrentStatuses: attempts.map((response) => response.status), settledReplay: settled.body.replayed,
    concurrentPersisted: concurrentAfter - concurrentBefore, reusedToken: reusedToken.body.error };
  process.stdout.write(`${JSON.stringify({ idempotencyProbe: row })}\n`);
  return row;
}

async function staleAcceptanceProbe() {
  const body = payload("prepare", "pizza", 2).body;
  const prepared = await post(`/public/menus/${slug}/orders/network-test/prepare`, body);
  if (prepared.status !== 200) throw new Error("Stale acceptance Prepare failed");
  const before = await observer.order.count({ where: { source: "NETWORK_TEST" } });
  const changed = structuredClone(pizza);
  changed.revision = 2;
  changed.groups[0].sizes[1].price = "201.000001";
  await observer.product.update({ where: { id: pizzaId }, data: {
    configurationTree: changed, configurationVersion: 2
  } });
  const response = await post(`/public/menus/${slug}/orders/network-test/`, {
    ...body, acceptanceToken: prepared.body.acceptanceToken, idempotencyKey: randomUUID()
  });
  const after = await observer.order.count({ where: { source: "NETWORK_TEST" } });
  if (response.status !== 409 || after !== before || response.body.orderId !== undefined) {
    throw new Error(`Stale acceptance was not safely rejected: ${response.status}`);
  }
  const row = { status: response.status, error: response.body.error, persisted: after - before };
  process.stdout.write(`${JSON.stringify({ staleAcceptanceProbe: row })}\n`);
  return row;
}

async function storageProbe(kind, concurrency, tenantMode = "same") {
  const label = `diagnostic-${kind}-${concurrency}-${randomUUID()}`;
  const responses = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
    const idempotencyKey = `${label}-${index}`;
    const probeRestaurantId = tenantMode === "spread" ? diagnosticTenants[index % diagnosticTenants.length] : restaurantId;
    try {
      await observer.$transaction(async (transaction) => {
        if (["read_misses", "read_then_order", "read_idempotency_then_order", "read_then_order_with_item"].includes(kind)) {
          await transaction.order.findUnique({ where: { restaurantId_idempotencyKey: {
            restaurantId: probeRestaurantId, idempotencyKey } } });
        }
        if (["read_misses", "read_then_order", "read_token_then_order", "read_then_order_with_item"].includes(kind)) {
          await transaction.order.findUnique({ where: { restaurantId_acceptanceTokenHash: {
            restaurantId: probeRestaurantId, acceptanceTokenHash: idempotencyKey } } });
        }
        if (kind !== "read_misses") {
          await transaction.order.create({ data: { restaurantId: probeRestaurantId, totalAmount: "0", currency: "EGP",
            status: "VALIDATED_TEST", source: "DIAGNOSTIC", idempotencyKey,
            acceptanceTokenHash: idempotencyKey,
            ...(["order_with_item", "read_then_order_with_item"].includes(kind) ? { items: { create: [{ name: "Diagnostic", quantity: 1,
              unitPrice: "0", totalPrice: "0" }] } } : {}) } });
        }
      }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });
      return "ok";
    } catch (error) { return String(error?.code ?? "UNKNOWN"); }
  }));
  const codes = Object.fromEntries([...new Set(responses)].map((code) => [code, responses.filter((item) => item === code).length]));
  const row = { kind, concurrency, tenantMode, codes };
  process.stdout.write(`${JSON.stringify({ storageProbe: row })}\n`);
  return row;
}

async function predicateLockProbe() {
  let reached;
  let release;
  const reachedPromise = new Promise((resolve) => { reached = resolve; });
  const releasePromise = new Promise((resolve) => { release = resolve; });
  const key = `predicate-${randomUUID()}`;
  const reader = observer.$transaction(async (transaction) => {
    const [backend] = await transaction.$queryRaw`SELECT pg_backend_pid()::int AS pid`;
    await transaction.order.findUnique({ where: { restaurantId_idempotencyKey: { restaurantId, idempotencyKey: key } } });
    await transaction.order.findUnique({ where: { restaurantId_acceptanceTokenHash: {
      restaurantId, acceptanceTokenHash: key } } });
    reached(backend.pid);
    await releasePromise;
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });
  try {
    const pid = await withTimeout(reachedPromise, 10_000, "Predicate read");
    const locks = await observer.$queryRaw`SELECT l.locktype, l.mode, c.relname AS relation,
      count(*)::int AS count FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation
      WHERE l.pid = ${pid} AND l.mode = 'SIReadLock'
      GROUP BY l.locktype, l.mode, c.relname ORDER BY c.relname`;
    const row = { locks };
    process.stdout.write(`${JSON.stringify({ predicateLockProbe: row })}\n`);
    return row;
  } finally { release(); await reader; }
}

async function probeOnlyRun() {
  await seedDiagnosticVariants();
  for (const tenantId of diagnosticTenants) await growCatalog(100, tenantId);
  await predicateLockProbe();
  for (const kind of ["read_misses", "order_only", "read_idempotency_then_order",
    "read_token_then_order", "read_then_order", "order_with_item", "read_then_order_with_item"]) {
    await storageProbe(kind, 25);
  }
  await storageProbe("read_then_order", 5, "spread");
  await storageProbe("read_then_order", 25, "spread");
  await idempotencyProbe();
  await staleAcceptanceProbe();
}

async function diagnosticRun() {
  await seedDiagnosticVariants();
  const diagnostics = { waves: [], storage: [], idempotency: null };
  for (const size of [100, 1_000]) {
    for (const tenantId of diagnosticTenants) await growCatalog(size, tenantId);
    for (const scenario of ["pizza", "different_products", "different_selections", "different_tenants"]) {
      for (const concurrency of [1, 5, 10, 25]) {
        for (const kind of ["prepare", "create"]) {
          const row = await series(kind, scenario, size, concurrency, 1,
            scenario === "pizza" ? payload : diagnosticPayload);
          diagnostics.waves.push(row);
          if (result.stopped) throw new Error(result.stopped);
        }
      }
    }
    if (size === 100) {
      for (const kind of ["read_misses", "order_only", "read_then_order", "order_with_item"]) {
        for (const concurrency of [1, 5, 10, 25]) diagnostics.storage.push(await storageProbe(kind, concurrency));
      }
      diagnostics.idempotency = await idempotencyProbe();
    }
  }
  diagnostics.staleAcceptance = await staleAcceptanceProbe();
  process.stdout.write(`STAGE6D3C3B_DIAGNOSTIC=${JSON.stringify(diagnostics)}\n`);
}

try {
  await prisma.$connect();
  await observer.$connect();
  await verifyTarget();
  await seedBase();
  await correctnessChecks();
  if (process.env.STAGE6D3C3_DIAG === "probe") await probeOnlyRun();
  else if (diagnosticMode) await diagnosticRun();
  else for (const size of (onlySize ? [Number(onlySize)] : [10, 100, 1_000, 10_000])) {
    const fixtureMs = await growCatalog(size);
    process.stdout.write(`${JSON.stringify({ catalogReady: size, fixtureMs })}\n`);
    for (const kind of ["quote", "prepare", "create"]) {
      const measured = await series(kind, "pizza", size, 1, size === 10_000 ? 5 : 9);
      if (measured) result.catalog.push({ ...measured, fixtureMsExcluded: fixtureMs });
      if (result.stopped) break;
    }
    if (result.stopped) break;
    if (size === 100 || size === 1_000) {
      for (const concurrency of [1, 5, 10, 25]) {
        for (const kind of ["quote", "prepare", "create"]) {
          const measured = await series(kind, "pizza", size, concurrency, concurrency === 1 ? 5 : 2);
          if (measured) result.concurrency.push(measured);
          if (result.stopped) break;
        }
        if (result.stopped) break;
      }
      if (result.stopped) break;
      for (const concurrency of [1, 5]) await lockTrial(size, concurrency);
    }
    if (size === 1_000) {
      for (const scenario of (runtimeGuardMode ? ["combo", "ten", "fifty"] : ["combo", "fifty"])) {
        for (const kind of ["quote", "prepare", "create"]) {
          if (scenario === "fifty" && kind === "quote") continue; // Quote accepts one selected Product, not an Order.
          const measured = await series(kind, scenario, size, 1, scenario === "fifty" ? 3 : 7);
          if (measured) result.complex.push(measured);
          if (result.stopped) break;
        }
        if (result.stopped) break;
      }
    }
    if (result.stopped) break;
  }
} catch (error) {
  result.stopped = result.stopped ?? `Benchmark failed safely: ${error?.message ?? error}`;
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  await prisma.$disconnect();
  await observer.$disconnect();
  process.stdout.write(`STAGE6D3C3_RESULT=${JSON.stringify(result)}\n`);
}
