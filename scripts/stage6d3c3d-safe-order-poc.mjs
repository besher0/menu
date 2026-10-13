/** Manual Stage 6D.3C3D PoC. Requires two NEW, exact disposable DBs; never loads .env. */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
require("reflect-metadata");
const { Module, ConflictException } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const { PrismaClient, Prisma } = require("@prisma/client");
const { NetworkOrdersService } = require("../apps/api/dist/modules/orders/network-orders.service.js");
const { NetworkOrdersController, NetworkOrderLoopbackGuard } = require("../apps/api/dist/modules/orders/network-orders.controller.js");
const { parseNetworkOrderRequest, sha256, verifyAcceptanceToken } = require("../apps/api/dist/modules/orders/network-order-contract.js");

const prefix = "ordersawa_stage3_stage6c_stage6d3c3d_";
if (process.env.NODE_ENV === "production" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1") throw new Error("Non-Production and test flag required");
const urls = { a: process.env.STAGE6D3C3D_A_URL, b: process.env.STAGE6D3C3D_B_URL };
for (const [kind, raw] of Object.entries(urls)) {
  if (!raw) throw new Error(`Missing explicit disposable URL for ${kind}`);
  const parsed = new URL(raw);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55440" || parsed.pathname !== `/${prefix}${kind}`)
    throw new Error(`Refusing non-disposable URL for ${kind}`);
}
const contexts = {};
const tenants = Array.from({ length: 5 }, (_, i) => ({ id: `d3d-tenant-${i}`, slug: `d3d-${i}`,
  pizza: `d3d-pizza-${i}`, source: `d3d-source-${i}`, combo: `d3d-combo-${i}` }));
const pizzaTree = (t, rev = 1, sizePrice = "200.000001") => ({ schemaVersion: 1, productId: t.pizza, revision: rev, basePrice: null,
  groups: [{ type: "SIZE", id: "sizes", label: "Sizes", sizes: [{ id: "small", label: "Small", price: "100" },
    { id: "medium", label: "Medium", price: sizePrice }] },
  { type: "OPTIONS", id: "toppings", label: "Toppings", min: 0, max: 3, includedQuantity: 1,
    options: [{ id: "cheese", label: "Cheese", price: "30.000001", maxQuantity: 3,
      children: [{ type: "OPTIONS", id: "sauces", label: "Sauces", min: 0, max: 1, includedQuantity: 0,
        options: [{ id: "bbq", label: "BBQ", price: "5.000001", maxQuantity: 1 }] }] }] }] });
const sourceTree = (t) => ({ schemaVersion: 1, productId: t.source, revision: 1, basePrice: null,
  groups: [{ type: "SIZE", id: "source-sizes", label: "Source sizes", sizes: [
    { id: "source-small", label: "Small", price: "100" }, { id: "source-large", label: "Large", price: "200" }] }] });
const comboTree = (t) => ({ schemaVersion: 1, productId: t.combo, revision: 1, basePrice: "0", groups: [
  { type: "OPTIONS", id: "slots", label: "Combo", min: 3, max: 3, includedQuantity: 0, options: [
    { id: "original", label: "Original", price: "10", maxQuantity: 2,
      linkedProduct: { sourceProductId: t.source, mode: "ORIGINAL",
        originalPriceOverrides: { "source-small": "5", "source-large": "8" } } },
    { id: "custom", label: "Custom", price: "3", maxQuantity: 1,
      linkedProduct: { sourceProductId: t.source, mode: "CUSTOM", customConfiguration: {
        schemaVersion: 1, productId: t.source, revision: 1, basePrice: null, groups: [
          { type: "SIZE", id: "custom-sizes", label: "Custom sizes", sizes: [{ id: "custom-medium", label: "Medium", price: "7" }] }
        ] } } }
  ] } ] });
const pizzaSelection = (t, rev = 1) => ({ schemaVersion: 1, productId: t.pizza, configurationRevision: rev, groups: [
  { type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" },
  { type: "OPTIONS", groupId: "toppings", instances: [
    { instanceId: "cheese-1", optionId: "cheese", children: [{ type: "OPTIONS", groupId: "sauces", instances: [
      { instanceId: "sauce-1", optionId: "bbq" }] }] },
    { instanceId: "cheese-2", optionId: "cheese" }, { instanceId: "cheese-3", optionId: "cheese" }
  ] } ] });
const comboSelection = (t) => ({ schemaVersion: 1, productId: t.combo, configurationRevision: 1, groups: [
  { type: "OPTIONS", groupId: "slots", instances: [
    { instanceId: "original-1", optionId: "original", linkedSelection: { schemaVersion: 1, productId: t.source,
      configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-small" }] } },
    { instanceId: "original-2", optionId: "original", linkedSelection: { schemaVersion: 1, productId: t.source,
      configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-large" }] } },
    { instanceId: "custom-1", optionId: "custom", linkedSelection: { schemaVersion: 1, productId: t.source,
      configurationRevision: 1, groups: [{ type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-medium" }] } }
  ] } ] });
const summary = (items) => { const sorted = [...items].sort((a, b) => a - b); return { samples: sorted.length,
  medianMs: sorted.length ? +sorted[Math.ceil(sorted.length / 2) - 1].toFixed(2) : null,
  p95Ms: sorted.length >= 20 ? +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2) : null }; };
const serialized = (e) => e?.code === "P2034" || (e?.code === "P2010" && ["40001", "40P01"].includes(e.meta?.code));
const results = { environment: {}, sql: [], http: [], negatives: [], pricing: [] };

async function verifyAndSeed(kind) {
  const db = new PrismaClient({ datasourceUrl: urls[kind] });
  await db.$connect();
  const [actual] = await db.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port, version() AS version`;
  if (actual.name !== `${prefix}${kind}` || actual.address !== "127.0.0.1" || actual.port !== 55440
    || await db.restaurant.count() !== 0 || await db.order.count() !== 0) throw new Error(`Dirty or incorrect ${kind} database`);
  const [trigger] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_trigger WHERE tgname = 'PoC_order_complete_at_commit'`;
  if (trigger.count !== 1) throw new Error("Disposable completion trigger missing");
  await db.restaurant.createMany({ data: tenants.map((t) => ({ id: t.id, slug: t.slug, name: `PoC ${t.slug}`, currency: "EGP" })) });
  await db.subscriptionPlan.create({ data: { id: "d3d-plan", key: "D3D_TEST", name: "PoC plan",
    features: { create: { id: "d3d-feature", key: "PRODUCT_CONFIGURATION", enabled: true } } } });
  await db.restaurantSubscription.createMany({ data: tenants.map((t, i) => ({ id: `d3d-sub-${i}`,
    restaurantId: t.id, planId: "d3d-plan", status: "ACTIVE", startsAt: new Date("2026-01-01T00:00:00Z") })) });
  await db.product.createMany({ data: tenants.flatMap((t) => [
    { id: t.pizza, restaurantId: t.id, slug: "pizza", name: "Pizza", currency: "EGP",
      basePrice: null, configurationVersion: 1, configurationTree: pizzaTree(t) },
    { id: t.source, restaurantId: t.id, slug: "source", name: "Linked", currency: "EGP",
      basePrice: null, configurationVersion: 1, configurationTree: sourceTree(t) },
    { id: t.combo, restaurantId: t.id, slug: "combo", name: "Combo", currency: "EGP",
      basePrice: "0", configurationVersion: 1, configurationTree: comboTree(t) }
  ]) });
  const service = new NetworkOrdersService(db);
  class TestModule {}
  Module({ controllers: [NetworkOrdersController], providers: [NetworkOrderLoopbackGuard,
    { provide: NetworkOrdersService, useValue: service }] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const context = { kind, db, service, app, actual, runtimeOrigin: await app.getUrl(), retries: 0,
    errorCodes: {}, pocServer: null };
  context.pocServer = createServer(async (req, res) => {
    if (req.socket.remoteAddress !== "127.0.0.1" || req.method !== "POST" || !/^\/poc\/d3d-[0-4]\/create$/.test(req.url ?? "")) {
      res.writeHead(403).end(); return;
    }
    try {
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 256_000) throw new Error("BODY_LIMIT"); }
      const answer = await candidateCreate(context, req.url.split("/")[2], JSON.parse(body));
      res.writeHead(answer.status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(answer.body));
    } catch {
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "POC_INTERNAL_ERROR" }));
    }
  });
  await new Promise((resolve) => context.pocServer.listen(0, "127.0.0.1", resolve));
  context.pocOrigin = `http://127.0.0.1:${context.pocServer.address().port}`;
  contexts[kind] = context;
  results.environment[kind] = { version: actual.version, database: actual.name, address: actual.address, port: actual.port };
  return context;
}

function snapshotData(draft) {
  const createdAt = new Date().toISOString();
  const items = draft.items.map((item) => ({ snapshotVersion: 1, mode: "NETWORK", locale: draft.locale,
    currency: draft.currency, ...item, createdAt }));
  const cartSnapshot = { snapshotVersion: 1, mode: "NETWORK", locale: draft.locale,
    orderDetails: draft.orderDetails, totalAmount: draft.totalAmount, currency: draft.currency, items, createdAt };
  return { items, cartSnapshot };
}
async function claim(tx, restaurantId, request, requestHash, tokenHash) {
  const rows = await tx.$queryRaw`INSERT INTO "PoCOrderClaim"
    ("restaurantId", "idempotencyKey", "acceptanceTokenHash", "requestHash")
    VALUES (${restaurantId}, ${request.idempotencyKey}, ${tokenHash}, ${requestHash})
    ON CONFLICT DO NOTHING RETURNING "idempotencyKey"`;
  if (rows.length !== 1) throw new ConflictException({ error: "POC_CLAIM_EXISTS" });
}
async function lookupCommitted(context, slug, request, requestHash, tokenHash) {
  return context.db.$transaction(async (tx) => {
    const tenant = await tx.restaurant.findFirst({ where: { slug, isActive: true, deletedAt: null }, select: { id: true } });
    if (!tenant) return null;
    if (context.kind === "b") {
      const [byKey] = await tx.$queryRaw`SELECT "orderId", "requestHash", "acceptanceTokenHash" FROM "PoCOrderClaim"
        WHERE "restaurantId" = ${tenant.id} AND "idempotencyKey" = ${request.idempotencyKey}`;
      if (byKey && (byKey.requestHash !== requestHash || byKey.acceptanceTokenHash !== tokenHash))
        return { status: 409, body: { error: "IDEMPOTENCY_KEY_REUSED" } };
      if (byKey) {
        const order = await tx.order.findFirst({ where: { id: byKey.orderId, restaurantId: tenant.id,
          idempotencyKey: request.idempotencyKey, requestHash, acceptanceTokenHash: tokenHash,
          source: "NETWORK_TEST", networkSnapshotSealedAt: { not: null } } });
        return order ? replay(order) : { status: 409, body: { error: "CLAIM_FINALIZATION_INCONSISTENT" } };
      }
      const [used] = await tx.$queryRaw`SELECT "orderId" FROM "PoCOrderClaim" WHERE "restaurantId" = ${tenant.id}
        AND "acceptanceTokenHash" = ${tokenHash}`;
      if (used) return { status: 409, body: { error: "ACCEPTANCE_TOKEN_ALREADY_USED" } };
    } else {
      const order = await tx.order.findUnique({ where: { restaurantId_idempotencyKey: {
        restaurantId: tenant.id, idempotencyKey: request.idempotencyKey } } });
      if (order) return order.requestHash === requestHash && order.acceptanceTokenHash === tokenHash
        && order.source === "NETWORK_TEST" && !!order.networkSnapshotSealedAt
        ? replay(order) : { status: 409, body: { error: "IDEMPOTENCY_KEY_REUSED" } };
      const used = await tx.order.findUnique({ where: { restaurantId_acceptanceTokenHash: {
        restaurantId: tenant.id, acceptanceTokenHash: tokenHash } } });
      if (used) return { status: 409, body: { error: "ACCEPTANCE_TOKEN_ALREADY_USED" } };
    }
    return null;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
function replay(order) { return { status: 201, body: { orderId: order.id,
  totalAmount: order.totalAmount.toString(), currency: order.currency, status: order.status,
  replayed: true, orderingEnabled: false } }; }

async function candidateCreate(context, slug, raw, fault) {
  const request = parseNetworkOrderRequest(raw, true);
  const requestHash = sha256(request), tokenHash = sha256(request.acceptanceToken);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const answer = await context.db.$transaction(async (tx) => {
        const restaurant = await context.service.lockRestaurant(tx, slug);
        if (context.kind === "b") await claim(tx, restaurant.id, request, requestHash, tokenHash);
        const catalog = await context.service.lockCatalog(tx, restaurant.id);
        const draft = context.service.buildDraft(restaurant, catalog, request);
        if (!verifyAcceptanceToken(request.acceptanceToken, restaurant.id, sha256(draft)))
          throw new ConflictException({ error: "NETWORK_ORDER_REQUIRES_NEW_ACCEPTANCE" });
        const { items, cartSnapshot } = snapshotData(draft);
        const order = await tx.order.create({ data: { restaurantId: restaurant.id,
          totalAmount: draft.totalAmount, customerName: draft.orderDetails.customerName,
          customerPhone: draft.orderDetails.customerPhone, currency: draft.currency,
          status: "VALIDATED_TEST", source: "NETWORK_TEST", idempotencyKey: request.idempotencyKey,
          requestHash, acceptanceTokenHash: tokenHash, cartSnapshot } });
        if (fault === "after_order_return") return { orderId: order.id, totalAmount: draft.totalAmount };
        if (fault === "item_insert_failure") {
          await tx.orderItem.create({ data: { orderId: order.id, productId: "missing-product", name: "bad",
            quantity: 1, unitPrice: "1", totalPrice: "1" } });
        }
        await tx.orderItem.createMany({ data: items.map((item) => ({ orderId: order.id, productId: item.productId,
          name: item.productName, quantity: item.quantity, note: item.note,
          unitPrice: item.unitPrice, totalPrice: item.lineTotal, options: item })) });
        if (fault === "before_seal_return") return { orderId: order.id, totalAmount: draft.totalAmount };
        await tx.order.update({ where: { id: order.id }, data: { networkSnapshotSealedAt: new Date() } });
        if (fault === "before_claim_finalization_return") return { orderId: order.id, totalAmount: draft.totalAmount };
        if (context.kind === "b") await tx.$executeRaw`UPDATE "PoCOrderClaim" SET "orderId" = ${order.id}
          WHERE "restaurantId" = ${restaurant.id} AND "idempotencyKey" = ${request.idempotencyKey}`;
        if (fault === "timeout_before_commit") throw new Error("POC_TIMEOUT_BEFORE_COMMIT");
        // Surface deferred trigger failures before the Prisma callback can report a misleading success.
        await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
        return { orderId: order.id, totalAmount: draft.totalAmount, currency: draft.currency,
          status: "VALIDATED_TEST", replayed: false, orderingEnabled: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
      // A fresh scoped read also catches a silently rolled-back deferred COMMIT on an accidental early return.
      const confirmed = await context.db.$transaction(async (tx) => {
        const tenant = await tx.restaurant.findFirst({ where: { slug, isActive: true, deletedAt: null }, select: { id: true } });
        return tenant ? tx.order.findFirst({ where: { id: answer.orderId, restaurantId: tenant.id,
          idempotencyKey: request.idempotencyKey, requestHash, acceptanceTokenHash: tokenHash,
          source: "NETWORK_TEST", networkSnapshotSealedAt: { not: null } } }) : null;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (!confirmed) return { status: 409, body: { error: "POC_COMMIT_NOT_CONFIRMED" } };
      return { status: 201, body: answer };
    } catch (error) {
      const diagnosticCode = `${error.code ?? (typeof error.getStatus === "function" ? `HTTP_${error.getStatus()}` : "OTHER")}:${error.meta?.code ?? ""}`;
      context.errorCodes[diagnosticCode] = (context.errorCodes[diagnosticCode] ?? 0) + 1;
      if (serialized(error) && attempt < 2) { context.retries++; continue; }
      // Fresh scoped transaction: only a committed, sealed, exact-request Order may be replayed.
      if (error?.message !== "POC_TIMEOUT_BEFORE_COMMIT") {
        const settled = await lookupCommitted(context, slug, request, requestHash, tokenHash);
        if (settled) return settled;
      }
      if (serialized(error)) return { status: 409, body: { error: "NETWORK_ORDER_CONCURRENT_UPDATE" } };
      if (error?.message === "POC_TIMEOUT_BEFORE_COMMIT") return { status: 599, body: { error: "POC_TIMEOUT_BEFORE_COMMIT" } };
      if (error?.code === "P2002" || (error?.code === "P2010" && error.meta?.code === "23505"))
        return { status: 409, body: { error: "UNIQUE_CONFLICT_NOT_VISIBLE" } };
      if (typeof error?.getStatus === "function") return { status: error.getStatus(), body: error.getResponse() };
      if (fault) return { status: 598, body: { error: String(error.code ?? "POC_FAILURE") } };
      throw error;
    }
  }
}

async function post(origin, path, body) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  return { status: response.status, body: await response.json(), elapsed: performance.now() - started };
}
async function prepare(context, t, mode = "pizza", note = randomUUID()) {
  const productId = mode === "combo" ? t.combo : t.pizza;
  const body = { locale: "en", items: [{ productId, quantity: 1,
    selection: mode === "combo" ? comboSelection(t) : pizzaSelection(t) }], orderNote: note };
  const answer = await post(context.runtimeOrigin, `/public/menus/${t.slug}/orders/network-test/prepare`, body);
  if (answer.status !== 200) throw new Error(`Prepare failed: ${answer.status} ${answer.body.error}`);
  return { slug: t.slug, body: { ...body, acceptanceToken: answer.body.acceptanceToken,
    idempotencyKey: randomUUID() }, expected: answer.body.draft.totalAmount };
}
async function createHttp(context, variant, entry) {
  return variant === "current"
    ? post(context.runtimeOrigin, `/public/menus/${entry.slug}/orders/network-test/`, entry.body)
    : post(context.pocOrigin, `/poc/${entry.slug}/create`, entry.body);
}
async function httpWave(context, variant, mode, count, repetition) {
  const entries = [];
  for (let i = 0; i < count; i++) {
    const t = mode === "tenants" ? tenants[i % tenants.length] : tenants[0];
    entries.push(await prepare(context, t, "pizza", `${variant}-${mode}-${count}-${repetition}-${i}-${randomUUID()}`));
  }
  if (mode === "same_key_same_payload") for (let i = 1; i < count; i++) entries[i] = structuredClone(entries[0]);
  if (mode === "same_key_changed_payload") for (let i = 1; i < count; i++) entries[i].body.idempotencyKey = entries[0].body.idempotencyKey;
  if (mode === "same_token_new_keys") for (let i = 1; i < count; i++) entries[i] = { ...structuredClone(entries[0]),
    body: { ...structuredClone(entries[0].body), idempotencyKey: randomUUID() } };
  const before = await context.db.order.count({ where: { source: "NETWORK_TEST" } });
  const retriesBefore = context.retries;
  const responses = await Promise.all(entries.map((entry) => createHttp(context, variant, entry)));
  const after = await context.db.order.count({ where: { source: "NETWORK_TEST" } });
  const created = responses.filter((r) => r.status === 201 && r.body.replayed === false);
  const replayed = responses.filter((r) => r.status === 201 && r.body.replayed === true);
  const conflicts = responses.filter((r) => r.status === 409);
  if (after - before !== created.length || responses.some((r) => ![201, 409].includes(r.status))
    || (mode.startsWith("same_") && created.length > 1)) throw new Error(`Unsafe HTTP wave ${context.kind}/${variant}/${mode}`);
  const orders = await context.db.order.findMany({ where: { id: { in: created.map((r) => r.body.orderId) } }, include: { items: true } });
  if (orders.length !== created.length || orders.some((o) => o.totalAmount.toString() !== "265.000004"
    || o.cartSnapshot?.totalAmount !== "265.000004" || !o.networkSnapshotSealedAt || o.items.length !== 1))
    throw new Error(`Incorrect saved Order in ${context.kind}/${variant}/${mode}`);
  const row = { design: variant === "current" ? "current" : context.kind.toUpperCase(), mode, count, repetition,
    created: created.length, replayed: replayed.length, conflicts: conflicts.length,
    conflictCodes: Object.fromEntries([...new Set(conflicts.map((r) => r.body.error))].map((code) => [code,
      conflicts.filter((r) => r.body.error === code).length])),
    retries: variant === "current" ? null : context.retries - retriesBefore,
    latency: summary(responses.map((r) => r.elapsed)) };
  results.http.push(row); process.stdout.write(`HTTP ${JSON.stringify(row)}\n`);
}

async function negative(context, label, operation) {
  const beforeOrders = await context.db.order.count();
  const beforeClaims = await context.db.$queryRaw`SELECT count(*)::int AS count FROM "PoCOrderClaim"`;
  let code = "unexpected_success";
  try { await operation(); } catch (error) { code = `${error.code ?? "error"}:${error.meta?.code ?? ""}`; }
  const afterOrders = await context.db.order.count();
  const afterClaims = await context.db.$queryRaw`SELECT count(*)::int AS count FROM "PoCOrderClaim"`;
  if (afterOrders !== beforeOrders || afterClaims[0].count !== beforeClaims[0].count)
    throw new Error(`Negative commit escaped ${context.kind}/${label}: ${code}`);
  const row = { design: context.kind.toUpperCase(), case: label,
    rejected: code === "unexpected_success" ? "Prisma_resolved_but_PostgreSQL_rolled_back" : code,
    partialOrders: 0, pendingClaims: 0 };
  results.negatives.push(row); process.stdout.write(`NEGATIVE ${JSON.stringify(row)}\n`);
}
function incompleteOrder(t, overrides = {}) {
  return { restaurantId: t.id, totalAmount: "1", currency: "EGP", status: "VALIDATED_TEST",
    source: "NETWORK_TEST", idempotencyKey: randomUUID(), acceptanceTokenHash: randomUUID(), requestHash: randomUUID(),
    networkSnapshotSealedAt: new Date(), ...overrides };
}
async function negativeCommits(context) {
  const t = tenants[0], db = context.db;
  await negative(context, "sealed_order_without_snapshot", () => db.$transaction(async tx => {
    await tx.order.create({ data: incompleteOrder(t) });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }));
  await negative(context, "snapshot_without_order_items", () => db.$transaction(async tx => {
    await tx.order.create({ data: incompleteOrder(t, {
      cartSnapshot: { snapshotVersion: 1, mode: "NETWORK", currency: "EGP", totalAmount: "1", items: [{}] } }) });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }));
  await negative(context, "snapshot_total_mismatch", () => db.$transaction(async tx => {
    const order = await tx.order.create({ data: incompleteOrder(t, { networkSnapshotSealedAt: null,
      cartSnapshot: { snapshotVersion: 1, mode: "NETWORK", currency: "EGP", totalAmount: "2", items: [{}] } }) });
    await tx.orderItem.create({ data: { orderId: order.id, name: "item", quantity: 1,
      unitPrice: "1", totalPrice: "1", options: {} } });
    await tx.order.update({ where: { id: order.id }, data: { networkSnapshotSealedAt: new Date() } });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }));
  await negative(context, "snapshot_item_content_mismatch", () => db.$transaction(async tx => {
    const historical = { productId: t.pizza, productName: "Historical", currency: "EGP",
      quantity: 1, unitPrice: "1", lineTotal: "1" };
    const altered = { ...historical, productName: "Altered" };
    const order = await tx.order.create({ data: incompleteOrder(t, { networkSnapshotSealedAt: null,
      cartSnapshot: { snapshotVersion: 1, mode: "NETWORK", currency: "EGP", totalAmount: "1", items: [historical] } }) });
    await tx.orderItem.create({ data: { orderId: order.id, productId: t.pizza, name: "Altered",
      quantity: 1, unitPrice: "1", totalPrice: "1", options: altered } });
    await tx.order.update({ where: { id: order.id }, data: { networkSnapshotSealedAt: new Date() } });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }));
  const entry = await prepare(context, t);
  for (const fault of ["after_order_return", "item_insert_failure", "before_seal_return",
    ...(context.kind === "b" ? ["before_claim_finalization_return"] : [])]) {
    await negative(context, fault, async () => {
      const answer = await candidateCreate(context, entry.slug,
        { ...entry.body, idempotencyKey: randomUUID() }, fault);
      if (answer.status === 201) return;
      throw Object.assign(new Error(answer.body.error ?? "rejected"), { code: answer.body.error });
    });
  }
  if (context.kind === "b") {
    await negative(context, "claim_only_commit", () => db.$executeRaw`INSERT INTO "PoCOrderClaim"
      ("restaurantId", "idempotencyKey", "acceptanceTokenHash", "requestHash")
      VALUES (${t.id}, ${randomUUID()}, ${randomUUID()}, ${randomUUID()})`);
  }
  const rollback = await prepare(context, t);
  const timedOut = await candidateCreate(context, rollback.slug, rollback.body, "timeout_before_commit");
  const retried = await candidateCreate(context, rollback.slug, rollback.body);
  if (timedOut.status !== 599 || retried.status !== 201 || retried.body.replayed) throw new Error("Timeout retry failed");
  results.negatives.push({ design: context.kind.toUpperCase(), case: "timeout_before_commit_then_retry", created: 1 });
  const replayed = await candidateCreate(context, rollback.slug, rollback.body);
  if (replayed.status !== 201 || !replayed.body.replayed || replayed.body.orderId !== retried.body.orderId)
    throw new Error("Commit-success retry failed");
  results.negatives.push({ design: context.kind.toUpperCase(), case: "commit_success_response_lost", replayedSameId: true });
  if (context.kind === "b") {
    await negative(context, "claim_points_to_wrong_sealed_order", () => db.$executeRaw`INSERT INTO "PoCOrderClaim"
      ("restaurantId", "idempotencyKey", "acceptanceTokenHash", "requestHash", "orderId")
      VALUES (${t.id}, ${randomUUID()}, ${randomUUID()}, ${randomUUID()}, ${retried.body.orderId})`);
    await negative(context, "complete_order_without_claim", () => db.$transaction(async tx => {
      const order = await tx.order.create({ data: incompleteOrder(t, { networkSnapshotSealedAt: null,
        cartSnapshot: { snapshotVersion: 1, mode: "NETWORK", currency: "EGP", totalAmount: "1", items: [{}] } }) });
      await tx.orderItem.create({ data: { orderId: order.id, name: "item", quantity: 1,
        unitPrice: "1", totalPrice: "1", options: {} } });
      await tx.order.update({ where: { id: order.id }, data: { networkSnapshotSealedAt: new Date() } });
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    }));
  }
}

async function pricingSafety(context) {
  const t = tenants[0], db = context.db;
  let historicalPizza;
  for (const mode of ["pizza", "combo"]) {
    const entry = await prepare(context, t, mode);
    const created = await candidateCreate(context, entry.slug, entry.body);
    const order = created.body.orderId ? await db.order.findUnique({ where: { id: created.body.orderId }, include: { items: true } }) : null;
    if (created.status !== 201 || order?.totalAmount.toString() !== entry.expected || !order.networkSnapshotSealedAt
      || order.items[0]?.options?.canonicalSelection?.groups?.[0] === undefined) throw new Error(`${mode} pricing/snapshot failed`);
    if (mode === "pizza") historicalPizza = { entry, orderId: created.body.orderId,
      snapshot: structuredClone(order.cartSnapshot) };
    if (mode === "combo" && order.cartSnapshot.items[0].canonicalSelection.groups[0].instances.length !== 3)
      throw new Error("Repeated Linked instances lost");
    results.pricing.push({ design: context.kind.toUpperCase(), case: mode, total: entry.expected,
      linkedInstances: mode === "combo" ? 3 : 0, sealed: true });
  }
  const stale = await prepare(context, t);
  await db.product.update({ where: { id: t.pizza }, data: { configurationTree: pizzaTree(t, 2, "201.000001"), configurationVersion: 2 } });
  const changed = await candidateCreate(context, stale.slug, stale.body);
  if (changed.status !== 409 || await db.order.count({ where: { restaurantId: t.id, idempotencyKey: stale.body.idempotencyKey } }) !== 0)
    throw new Error("Stale price/revision accepted");
  results.pricing.push({ design: context.kind.toUpperCase(), case: "price_and_revision_changed", rejected: changed.body.error });
  const replayAfterChange = await candidateCreate(context, historicalPizza.entry.slug, historicalPizza.entry.body);
  if (replayAfterChange.status !== 201 || !replayAfterChange.body.replayed
    || replayAfterChange.body.orderId !== historicalPizza.orderId) throw new Error("Historical replay lost after catalog change");
  const historicalAfter = await db.order.findUnique({ where: { id: historicalPizza.orderId }, select: { cartSnapshot: true } });
  if (JSON.stringify(historicalAfter.cartSnapshot) !== JSON.stringify(historicalPizza.snapshot))
    throw new Error("Sealed historical snapshot changed");
  results.pricing.push({ design: context.kind.toUpperCase(), case: "historical_replay_after_change",
    sameOrder: true, snapshotUnchanged: true });
  await db.product.update({ where: { id: t.pizza }, data: { configurationTree: pizzaTree(t), configurationVersion: 1 } });
  const invalidToken = await prepare(context, t);
  const invalidResponse = await candidateCreate(context, invalidToken.slug, { ...invalidToken.body,
    acceptanceToken: "v1.invalid.signature" });
  if (invalidResponse.status !== 409 || await db.order.count({ where: { restaurantId: t.id,
    idempotencyKey: invalidToken.body.idempotencyKey } }) !== 0) throw new Error("Invalid acceptance token accepted");
  results.pricing.push({ design: context.kind.toUpperCase(), case: "invalid_acceptance", status: invalidResponse.status });
  const unavailable = await prepare(context, t);
  await db.product.update({ where: { id: t.pizza }, data: { isAvailable: false } });
  const unavailableResponse = await candidateCreate(context, unavailable.slug, unavailable.body);
  if ([200, 201].includes(unavailableResponse.status)) throw new Error("Unavailable product accepted");
  results.pricing.push({ design: context.kind.toUpperCase(), case: "availability_lost", status: unavailableResponse.status });
  await db.product.update({ where: { id: t.pizza }, data: { isAvailable: true } });
  const capability = await prepare(context, t);
  await db.subscriptionFeature.update({ where: { id: "d3d-feature" }, data: { enabled: false } });
  const disabled = await candidateCreate(context, capability.slug, capability.body);
  if (disabled.status !== 403) throw new Error("Capability loss accepted");
  results.pricing.push({ design: context.kind.toUpperCase(), case: "capability_lost", status: disabled.status });
  await db.subscriptionFeature.update({ where: { id: "d3d-feature" }, data: { enabled: true } });
  const cross = await prepare(context, t);
  const crossResponse = await candidateCreate(context, tenants[1].slug, cross.body);
  if (crossResponse.status !== 404) throw new Error("Cross-tenant product/token accepted");
  results.pricing.push({ design: context.kind.toUpperCase(), case: "tenant_isolation", status: crossResponse.status });
}

async function sqlProbe(context, mode, count) {
  const db = context.db, t = tenants[0], prefixKey = randomUUID();
  const codes = await Promise.all(Array.from({ length: count }, async (_, i) => {
    const key = `${prefixKey}-${i}`;
    try {
      await db.$transaction(async (tx) => {
        if (mode === "read_before") {
          await tx.order.findUnique({ where: { restaurantId_idempotencyKey: { restaurantId: t.id, idempotencyKey: key } } });
          await tx.order.findUnique({ where: { restaurantId_acceptanceTokenHash: { restaurantId: t.id, acceptanceTokenHash: key } } });
        }
        await tx.order.create({ data: { restaurantId: t.id, totalAmount: "0", currency: "EGP",
          status: "VALIDATED_TEST", source: "DIAGNOSTIC", idempotencyKey: key, acceptanceTokenHash: key } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
      return "ok";
    } catch (e) { return `${e.code ?? "error"}:${e.meta?.code ?? ""}`; }
  }));
  const row = { design: context.kind.toUpperCase(), mode, count,
    codes: Object.fromEntries([...new Set(codes)].map((code) => [code, codes.filter((x) => x === code).length])) };
  results.sql.push(row); process.stdout.write(`SQL ${JSON.stringify(row)}\n`);
}

try {
  for (const kind of ["a", "b"]) await verifyAndSeed(kind);
  for (const kind of ["a", "b"]) {
    const context = contexts[kind];
    await negativeCommits(context);
    await pricingSafety(context);
  }
  await sqlProbe(contexts.a, "read_before", 25);
  await sqlProbe(contexts.a, "insert_only", 25);
  for (const count of [1, 5, 10, 25]) for (const repeat of [1, 2]) {
    for (const mode of ["distinct", "tenants"]) {
      await httpWave(contexts.a, "current", mode, count, repeat);
      await httpWave(contexts.a, "candidate", mode, count, repeat);
      await httpWave(contexts.b, "candidate", mode, count, repeat);
    }
  }
  for (const count of [1, 5, 10, 25]) for (const mode of ["same_key_same_payload", "same_key_changed_payload", "same_token_new_keys"])
    for (const kind of ["a", "b"]) await httpWave(contexts[kind], "candidate", mode, count, 1);
  const grouped = new Map();
  for (const row of results.http) {
    const key = `${row.design}/${row.mode}/${row.count}`;
    const prior = grouped.get(key) ?? { design: row.design, mode: row.mode, concurrency: row.count,
      waves: 0, created: 0, replayed: 0, conflicts: 0, retries: row.retries === null ? null : 0 };
    prior.waves++; prior.created += row.created; prior.replayed += row.replayed; prior.conflicts += row.conflicts;
    if (prior.retries !== null) prior.retries += row.retries;
    grouped.set(key, prior);
  }
  process.stdout.write(`STAGE6D3C3D_RESULT=${JSON.stringify({ environment: results.environment,
    sql: results.sql, negatives: results.negatives, pricing: results.pricing, httpWaves: results.http.length,
    matrix: [...grouped.values()], errorCodes: Object.fromEntries(Object.entries(contexts).map(([k, v]) => [k, v.errorCodes])) })}\n`);
} finally {
  for (const context of Object.values(contexts)) {
    if (context.pocServer) await new Promise((resolve) => context.pocServer.close(resolve));
    if (context.app) await context.app.close();
    if (context.db) await context.db.$disconnect();
  }
}
