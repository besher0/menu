/** Manual Stage 6D.3C3E verifier. Never reads .env or an existing database. */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
const require = createRequire(import.meta.url);
const { PrismaClient, Prisma } = require("@prisma/client");
const { Client } = require("pg");
const { NetworkOrdersService } = require("../apps/api/dist/modules/orders/network-orders.service.js");

const dbNames = {
  guard: "ordersawa_stage3_stage6c_stage6d3c3e_guard",
  control: "ordersawa_stage3_stage6c_stage6d3c3e_control"
};
if (process.env.NODE_ENV === "production" || process.env.ENABLE_DISPOSABLE_NETWORK_ORDERS !== "1")
  throw new Error("Refusing non-test environment");
const urls = { guard: process.env.STAGE6D3C3E_GUARD_URL, control: process.env.STAGE6D3C3E_CONTROL_URL };
for (const [kind, raw] of Object.entries(urls)) {
  if (!raw) throw new Error(`Explicit ${kind} disposable URL required`);
  const url = new URL(raw);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55440"
    || url.pathname !== `/${dbNames[kind]}`) throw new Error(`Refusing ${kind} non-disposable URL`);
}

const t = { id: "c3e-restaurant", slug: "c3e-demo", pizza: "c3e-pizza", source: "c3e-source", combo: "c3e-combo" };
const foreign = { restaurant: "c3e-other-restaurant", product: "c3e-other-product" };
const pizzaTree = { schemaVersion: 1, productId: t.pizza, revision: 1, basePrice: null, groups: [
  { type: "SIZE", id: "sizes", label: "Sizes", sizes: [
    { id: "small", label: "Small", price: "100" }, { id: "medium", label: "Medium", price: "200.000001" }
  ] },
  { type: "OPTIONS", id: "toppings", label: "Toppings", min: 0, max: 3, includedQuantity: 1,
    options: [{ id: "cheese", label: "Cheese", price: "30.000001", maxQuantity: 3,
      children: [{ type: "OPTIONS", id: "sauces", label: "Sauces", min: 0, max: 1, includedQuantity: 0,
        options: [{ id: "bbq", label: "BBQ", price: "5.000001", maxQuantity: 1 }] }] }] }
] };
const sourceTree = { schemaVersion: 1, productId: t.source, revision: 1, basePrice: null, groups: [
  { type: "SIZE", id: "source-sizes", label: "Source sizes", sizes: [
    { id: "source-small", label: "Small", price: "100" }, { id: "source-large", label: "Large", price: "200" }
  ] }
] };
const comboTree = { schemaVersion: 1, productId: t.combo, revision: 1, basePrice: "0", groups: [
  { type: "OPTIONS", id: "slots", label: "Combo", min: 3, max: 3, includedQuantity: 0, options: [
    { id: "original", label: "Original", price: "10", maxQuantity: 2,
      linkedProduct: { sourceProductId: t.source, mode: "ORIGINAL",
        originalPriceOverrides: { "source-small": "5", "source-large": "8" } } },
    { id: "custom", label: "Custom", price: "3", maxQuantity: 1,
      linkedProduct: { sourceProductId: t.source, mode: "CUSTOM", customConfiguration: {
        schemaVersion: 1, productId: t.source, revision: 1, basePrice: null, groups: [
          { type: "SIZE", id: "custom-sizes", label: "Custom sizes", sizes: [
            { id: "custom-medium", label: "Medium", price: "7" }
          ] }
        ] } } }
  ] }
] };
const pizzaSelection = { schemaVersion: 1, productId: t.pizza, configurationRevision: 1, groups: [
  { type: "SIZE", groupId: "sizes", sizeChoiceId: "medium" },
  { type: "OPTIONS", groupId: "toppings", instances: [
    { instanceId: "cheese-1", optionId: "cheese", children: [{ type: "OPTIONS", groupId: "sauces", instances: [
      { instanceId: "sauce-1", optionId: "bbq" }] }] },
    { instanceId: "cheese-2", optionId: "cheese" }, { instanceId: "cheese-3", optionId: "cheese" }
  ] }
] };
const comboSelection = { schemaVersion: 1, productId: t.combo, configurationRevision: 1, groups: [
  { type: "OPTIONS", groupId: "slots", instances: [
    { instanceId: "original-1", optionId: "original", linkedSelection: { schemaVersion: 1,
      productId: t.source, configurationRevision: 1, groups: [
        { type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-small" }] } },
    { instanceId: "original-2", optionId: "original", linkedSelection: { schemaVersion: 1,
      productId: t.source, configurationRevision: 1, groups: [
        { type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-large" }] } },
    { instanceId: "custom-1", optionId: "custom", linkedSelection: { schemaVersion: 1,
      productId: t.source, configurationRevision: 1, groups: [
        { type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-medium" }] } }
  ] }
] };

const result = { environment: {}, negatives: [], positives: [], prisma: [], legacy: [], performance: [] };
const dbs = {}, pgClients = {};
const clone = (value) => structuredClone(value);
const digest = () => randomBytes(32).toString("hex");
const summary = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  return { samples: ordered.length, medianMs: +ordered[Math.ceil(ordered.length / 2) - 1].toFixed(3),
    p95Ms: +ordered[Math.ceil(ordered.length * .95) - 1].toFixed(3) };
};
const reason = (error) => `${error?.code ?? "unknown"}:${error?.meta?.code ?? ""}`;

async function connectAndSeed(kind) {
  const db = new PrismaClient({ datasourceUrl: urls[kind] });
  await db.$connect();
  const [identity] = await db.$queryRaw`SELECT current_database() AS name,
    host(inet_server_addr()) AS host, inet_server_port() AS port, version() AS version`;
  const [trigger] = await db.$queryRaw`SELECT count(*)::int AS n FROM pg_trigger
    WHERE tgname = 'Order_network_test_completeness_guard'`;
  if (identity.name !== dbNames[kind] || identity.host !== "127.0.0.1" || identity.port !== 55440
    || trigger.n !== (kind === "guard" ? 1 : 0)
    || await db.restaurant.count() !== 0 || await db.order.count() !== 0)
    throw new Error(`Refusing dirty/wrong ${kind} database`);
  await db.restaurant.create({ data: { id: t.id, slug: t.slug, name: "Disposable Restaurant", currency: "EGP" } });
  await db.restaurant.create({ data: { id: foreign.restaurant, slug: "c3e-other", name: "Other Restaurant", currency: "EGP" } });
  await db.product.createMany({ data: [
    { id: t.pizza, restaurantId: t.id, slug: "pizza", name: "Pizza", currency: "EGP",
      basePrice: null, configurationVersion: 1, configurationTree: pizzaTree },
    { id: t.source, restaurantId: t.id, slug: "source", name: "Linked Source", currency: "EGP",
      basePrice: null, configurationVersion: 1, configurationTree: sourceTree },
    { id: t.combo, restaurantId: t.id, slug: "combo", name: "Combo", currency: "EGP",
      basePrice: "0", configurationVersion: 1, configurationTree: comboTree },
    { id: foreign.product, restaurantId: foreign.restaurant, slug: "foreign", name: "Foreign", currency: "EGP",
      basePrice: "1", configurationVersion: 0 }
  ] });
  dbs[kind] = db;
  const pg = new Client({ connectionString: urls[kind] });
  await pg.connect();
  pgClients[kind] = pg;
  result.environment[kind] = identity;
  return db;
}

function makeFixture(db, type, lines = 1) {
  const selection = type === "combo" ? comboSelection : pizzaSelection;
  const productId = type === "combo" ? t.combo : t.pizza;
  const service = new NetworkOrdersService(db);
  const draft = service.buildDraft({ id: t.id, slug: t.slug, name: "Disposable Restaurant", currency: "EGP" },
    [{ id: t.pizza, slug: "pizza", name: "Pizza", basePrice: null, configurationTree: pizzaTree,
      configurationVersion: 1, isActive: true, isAvailable: true, deletedAt: null },
    { id: t.source, slug: "source", name: "Linked Source", basePrice: null, configurationTree: sourceTree,
      configurationVersion: 1, isActive: true, isAvailable: true, deletedAt: null },
    { id: t.combo, slug: "combo", name: "Combo", basePrice: "0", configurationTree: comboTree,
      configurationVersion: 1, isActive: true, isAvailable: true, deletedAt: null }],
    { locale: "en", items: Array.from({ length: lines }, () => ({ productId, quantity: 1, selection })) });
  const createdAt = new Date().toISOString();
  const items = draft.items.map((item) => ({ snapshotVersion: 1, mode: "NETWORK", locale: draft.locale,
    currency: draft.currency, ...item, createdAt }));
  return { totalAmount: draft.totalAmount, items,
    snapshot: { snapshotVersion: 1, mode: "NETWORK", locale: draft.locale,
      orderDetails: draft.orderDetails, totalAmount: draft.totalAmount,
      currency: draft.currency, items, createdAt } };
}

function candidate(fixture, key = randomUUID()) {
  const value = { totalAmount: fixture.totalAmount, snapshot: clone(fixture.snapshot), items: clone(fixture.items) };
  return { ...value, restaurantId: t.id, currency: "EGP", customerName: null, customerPhone: null,
    idempotencyKey: key, requestHash: digest(), acceptanceTokenHash: digest() };
}

async function writePrisma(db, prepared, opts = {}) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.create({ data: {
      restaurantId: prepared.restaurantId, totalAmount: prepared.totalAmount,
      currency: prepared.currency, customerName: prepared.customerName,
      customerPhone: prepared.customerPhone, status: "VALIDATED_TEST", source: "NETWORK_TEST",
      idempotencyKey: prepared.idempotencyKey, requestHash: prepared.requestHash,
      acceptanceTokenHash: prepared.acceptanceTokenHash,
      ...(opts.noSnapshot ? {} : { cartSnapshot: prepared.snapshot })
    } });
    if (opts.afterOrderReturn) return order.id;
    if (opts.badItemInsert) await tx.orderItem.create({ data: { orderId: order.id,
      productId: "missing-product", name: "Broken", quantity: 1, unitPrice: "1", totalPrice: "1" } });
    if (!opts.noItems) await tx.orderItem.createMany({ data: prepared.items.map((item, index) => ({
      orderId: order.id, productId: opts.wrongProductId && index === 0 ? t.source : item.productId,
      name: item.productName, quantity: opts.wrongQuantity && index === 0 ? item.quantity + 1 : item.quantity,
      ...(opts.wrongOptions && index === 0 ? { name: "Forged label" } : {}),
      unitPrice: item.unitPrice, totalPrice: item.lineTotal,
      note: item.note, options: opts.wrongOptions && index === 0
        ? { ...item, productName: "Forged label" } : item
    })) });
    if (opts.failSeal) await tx.order.update({ where: { id: order.id },
      data: { cartSnapshot: { ...prepared.snapshot, totalAmount: "0" } } });
    if (!opts.noSeal) await tx.order.update({ where: { id: order.id },
      data: { networkSnapshotSealedAt: new Date() } });
    if (opts.namedImmediate) await tx.$executeRawUnsafe('SET CONSTRAINTS "Order_network_test_completeness_guard" IMMEDIATE');
    return order.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
}

async function expectFailed(label, prepared, opts = {}) {
  const db = dbs.guard;
  const before = await db.order.count();
  const beforeItems = await db.orderItem.count();
  let resolved = false, code = "";
  try { await writePrisma(db, prepared, opts); resolved = true; }
  catch (error) { code = reason(error); }
  const remaining = await db.order.count({ where: { restaurantId: t.id,
    idempotencyKey: prepared.idempotencyKey } });
  if (remaining !== 0 || await db.order.count() !== before || await db.orderItem.count() !== beforeItems)
    throw new Error(`Partial rows committed: ${label}`);
  result.negatives.push({ case: label, callbackResolved: resolved, error: code || "deferred_commit_rolled_back", partialOrders: 0 });
}

async function positivesAndNegatives() {
  const db = dbs.guard;
  const pizza = makeFixture(db, "pizza");
  const two = makeFixture(db, "pizza", 2);
  const combo = makeFixture(db, "combo");
  if (pizza.totalAmount !== "265.000004" || combo.totalAmount !== "43")
    throw new Error("Shared-backed pricing fixture changed");
  if (combo.items[0].canonicalSelection.groups[0].instances.length !== 3)
    throw new Error("Independent linked instances missing");
  await expectFailed("no_snapshot", candidate(pizza), { noSnapshot: true });
  await expectFailed("no_seal", candidate(pizza), { noSeal: true });
  await expectFailed("no_items", candidate(pizza), { noItems: true });
  const extraSnapshot = candidate(pizza);
  extraSnapshot.snapshot.items.push({ ...clone(extraSnapshot.snapshot.items[0]),
    unitPrice: "0", lineTotal: "0", priceBreakdown: [] });
  await expectFailed("snapshot_extra_item", extraSnapshot);
  const missingSnapshot = candidate(two);
  missingSnapshot.items[1].unitPrice = "0";
  missingSnapshot.items[1].lineTotal = "0";
  missingSnapshot.items[1].priceBreakdown = [];
  missingSnapshot.snapshot.items.pop();
  missingSnapshot.snapshot.totalAmount = pizza.totalAmount;
  missingSnapshot.totalAmount = pizza.totalAmount;
  await expectFailed("snapshot_missing_item", missingSnapshot);
  const wrongTotal = candidate(pizza);
  wrongTotal.totalAmount = "999";
  await expectFailed("total_mismatch", wrongTotal);
  const wrongCurrency = candidate(pizza);
  wrongCurrency.snapshot.currency = "USD";
  await expectFailed("currency_mismatch", wrongCurrency);
  await expectFailed("options_mismatch", candidate(pizza), { wrongOptions: true });
  await expectFailed("product_identity_mismatch", candidate(pizza), { wrongProductId: true });
  const crossTenant = candidate(pizza);
  crossTenant.snapshot.items[0].productId = foreign.product;
  crossTenant.snapshot.items[0].configurationTree.productId = foreign.product;
  crossTenant.snapshot.items[0].canonicalSelection.productId = foreign.product;
  crossTenant.items[0].productId = foreign.product;
  crossTenant.items[0].configurationTree.productId = foreign.product;
  crossTenant.items[0].canonicalSelection.productId = foreign.product;
  await expectFailed("cross_restaurant_product_identity", crossTenant);
  await expectFailed("quantity_mismatch", candidate(pizza), { wrongQuantity: true });
  await expectFailed("item_insert_failure", candidate(pizza), { badItemInsert: true });
  await expectFailed("seal_update_failure", candidate(pizza), { failSeal: true });
  await expectFailed("early_callback_return", candidate(pizza), { afterOrderReturn: true });
  await expectFailed("commit_before_finalization", candidate(pizza), { noSeal: true });
  const wrongBreakdown = candidate(pizza);
  wrongBreakdown.snapshot.items[0].priceBreakdown[0].chargedAmount = "0";
  wrongBreakdown.items[0].priceBreakdown[0].chargedAmount = "0";
  await expectFailed("breakdown_charge_mismatch", wrongBreakdown);
  const missingStructural = candidate(pizza);
  delete missingStructural.snapshot.items[0].canonicalSelection;
  delete missingStructural.items[0].canonicalSelection;
  await expectFailed("missing_selection_structure", missingStructural);
  const wrongVersion = candidate(pizza);
  wrongVersion.snapshot.snapshotVersion = 2;
  await expectFailed("invalid_snapshot_version", wrongVersion);
  const wrongMoney = candidate(pizza);
  wrongMoney.snapshot.items[0].unitPrice = "265.0000004";
  wrongMoney.items[0].unitPrice = "265.0000004";
  await expectFailed("over_precision_money", wrongMoney);
  const missingLocale = candidate(pizza);
  delete missingLocale.snapshot.locale;
  delete missingLocale.snapshot.items[0].locale;
  delete missingLocale.items[0].locale;
  await expectFailed("missing_locale", missingLocale);
  const invalidHash = candidate(pizza);
  invalidHash.acceptanceTokenHash = "short";
  await expectFailed("invalid_acceptance_hash_envelope", invalidHash);
  const sameKey = candidate(pizza);
  await expectFailed("rollback_before_retry", sameKey, { noSeal: true });
  const retryId = await writePrisma(db, sameKey);
  if (!await db.order.findFirst({ where: { id: retryId, networkSnapshotSealedAt: { not: null } } }))
    throw new Error("Retry after rollback did not commit");
  result.positives.push({ case: "retry_after_rollback", orderIdVerified: true });
  for (const [label, fixture] of [["pizza_nested_included", pizza], ["combo_repeated_original_custom", combo],
    ["ten_lines", makeFixture(db, "pizza", 10)], ["fifty_lines", makeFixture(db, "pizza", 50)]]) {
    const id = await writePrisma(db, candidate(fixture));
    const saved = await db.order.findUnique({ where: { id }, include: { items: true } });
    if (!saved?.networkSnapshotSealedAt || saved.items.length !== fixture.items.length
      || saved.totalAmount.toString() !== fixture.totalAmount) throw new Error(`Invalid positive ${label}`);
    result.positives.push({ case: label, lines: saved.items.length, total: fixture.totalAmount });
  }
  const sealed = await db.order.findUnique({ where: { id: retryId }, include: { items: true } });
  for (const [label, operation] of [
    ["post_seal_update", () => db.orderItem.update({ where: { id: sealed.items[0].id }, data: { name: "Changed" } })],
    ["post_seal_delete", () => db.orderItem.delete({ where: { id: sealed.items[0].id } })],
    ["post_seal_insert", () => db.orderItem.create({ data: { orderId: retryId, productId: t.pizza,
      name: "Extra", quantity: 1, unitPrice: "1", totalPrice: "1", options: {} } })]
  ]) {
    let rejected = false;
    try { await operation(); } catch { rejected = true; }
    if (!rejected) throw new Error(`Stage 6C immutability failed: ${label}`);
    result.negatives.push({ case: label, rejected: true, partialOrders: 0 });
  }
  const legacy = await db.order.create({ data: { restaurantId: t.id, totalAmount: "10.000001",
    currency: "EGP", source: "WHATSAPP", status: "PENDING_WHATSAPP",
    items: { create: [{ productId: t.pizza, name: "Legacy Pizza", quantity: 1,
      unitPrice: "10.000001", totalPrice: "10.000001" }] } }, include: { items: true } });
  if (legacy.cartSnapshot !== null || legacy.items.length !== 1) throw new Error("Legacy changed");
  result.legacy.push({ case: "legacy_without_network_snapshot", saved: true });
  let conversionRejected = false;
  try { await db.order.update({ where: { id: legacy.id }, data: { source: "NETWORK_TEST",
    idempotencyKey: randomUUID(), requestHash: digest(), acceptanceTokenHash: digest() } }); }
  catch { conversionRejected = true; }
  const stillLegacy = await db.order.findUnique({ where: { id: legacy.id } });
  if (!conversionRejected && stillLegacy?.source !== "WHATSAPP")
    throw new Error("Legacy Order converted without Network evidence");
  result.legacy.push({ case: "unsealed_legacy_to_network_transition", callbackRejected: conversionRejected,
    persistedSource: stillLegacy?.source });
}

async function prismaSemantics() {
  const db = dbs.guard, pizza = makeFixture(db, "pizza");
  const bad = candidate(pizza);
  let callbackResolved = false, code = "";
  try { await writePrisma(db, bad, { noItems: true }); callbackResolved = true; }
  catch (error) { code = reason(error); }
  if (await db.order.count({ where: { idempotencyKey: bad.idempotencyKey } }) !== 0)
    throw new Error("Deferred failure committed bad Order");
  result.prisma.push({ case: "deferred_commit_without_immediate", callbackResolved,
    code: code || "callback_resolved_but_commit_rolled_back", persisted: false });
  const immediateBad = candidate(pizza);
  let immediateError = "";
  try { await writePrisma(db, immediateBad, { noItems: true, namedImmediate: true }); }
  catch (error) { immediateError = reason(error); }
  if (!immediateError || await db.order.count({ where: { idempotencyKey: immediateBad.idempotencyKey } }) !== 0)
    throw new Error("Named IMMEDIATE did not surface invalid finalization");
  result.prisma.push({ case: "named_constraint_immediate_failure", code: immediateError, persisted: false });
  const good = candidate(pizza);
  const id = await writePrisma(db, good, { namedImmediate: true });
  if (!await db.order.findFirst({ where: { id, networkSnapshotSealedAt: { not: null } } }))
    throw new Error("Named IMMEDIATE rejected valid Order");
  result.prisma.push({ case: "named_constraint_immediate_success", persisted: true });

  const server = createServer(async (request, response) => {
    if (request.socket.remoteAddress !== "127.0.0.1" || request.url !== "/test-commit") {
      response.writeHead(403).end(); return;
    }
    const prepared = candidate(pizza);
    try {
      const orderId = await writePrisma(db, prepared, { namedImmediate: true,
        ...(request.method === "POST" ? {} : { noItems: true }) });
      const saved = await db.order.findFirst({ where: { id: orderId, restaurantId: t.id,
        idempotencyKey: prepared.idempotencyKey, requestHash: prepared.requestHash,
        acceptanceTokenHash: prepared.acceptanceTokenHash,
        source: "NETWORK_TEST", networkSnapshotSealedAt: { not: null } } });
      if (!saved) throw new Error("Commit not confirmed");
      response.writeHead(201).end(JSON.stringify({ orderId }));
    } catch { response.writeHead(409).end(JSON.stringify({ error: "ORDER_COMMIT_FAILED" })); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const denied = await fetch(`${origin}/test-commit`, { method: "GET" });
    const accepted = await fetch(`${origin}/test-commit`, { method: "POST" });
    if (denied.status !== 409 || accepted.status !== 201) throw new Error("False HTTP 201 after failed commit");
  result.prisma.push({ case: "loopback_http_commit_confirmation", failedStatus: denied.status,
      successStatus: accepted.status });
  } finally { await new Promise((resolve) => server.close(resolve)); }

  const pg = pgClients.guard, rawId = randomUUID();
  await pg.query("BEGIN");
  await pg.query(`INSERT INTO "Order" ("id","restaurantId","totalAmount","currency","status","source",
    "idempotencyKey","requestHash","acceptanceTokenHash","cartSnapshot","networkSnapshotSealedAt")
    VALUES ($1,$2,$3,'EGP','VALIDATED_TEST','NETWORK_TEST',$4,$5,$6,$7::jsonb,CURRENT_TIMESTAMP)`,
  [rawId, t.id, pizza.totalAmount, randomUUID(), digest(), digest(), JSON.stringify(pizza.snapshot)]);
  let commitCode = "";
  try { await pg.query("COMMIT"); } catch (error) { commitCode = error.code ?? "unknown"; }
  if (commitCode !== "23514" || await db.order.count({ where: { id: rawId } }) !== 0)
    throw new Error("PostgreSQL did not reject incomplete COMMIT directly");
  result.prisma.push({ case: "direct_postgresql_commit_rejection", sqlstate: commitCode, persisted: false });
}

async function pgWrite(client, prepared) {
  const orderId = randomUUID();
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query(`INSERT INTO "Order" ("id","restaurantId","totalAmount","currency","status","source",
      "idempotencyKey","requestHash","acceptanceTokenHash","cartSnapshot")
      VALUES ($1,$2,$3,$4,'VALIDATED_TEST','NETWORK_TEST',$5,$6,$7,$8::jsonb)`,
    [orderId, t.id, prepared.totalAmount, prepared.currency, randomUUID(), digest(), digest(),
      JSON.stringify(prepared.snapshot)]);
    const args = [];
    const tuples = prepared.items.map((item, index) => {
      const base = index * 9;
      args.push(randomUUID(), orderId, item.productId, item.productName, item.quantity,
        item.unitPrice, item.lineTotal, JSON.stringify(item), item.note ?? null);
      return `(${Array.from({ length: 9 }, (_, n) => `$${base + n + 1}`).join(",")})`;
    });
    await client.query(`INSERT INTO "OrderItem" ("id","orderId","productId","name","quantity",
      "unitPrice","totalPrice","options","note") VALUES ${tuples.join(",")}`, args);
    await client.query('UPDATE "Order" SET "networkSnapshotSealedAt"=CURRENT_TIMESTAMP WHERE "id"=$1', [orderId]);
    const start = performance.now();
    await client.query("COMMIT");
    return performance.now() - start;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function benchmark() {
  const cases = [
    ["one_line", "pizza", 1], ["ten_lines", "pizza", 10],
    ["fifty_lines", "pizza", 50], ["linked_combo", "combo", 1]
  ];
  for (const [label, type, lines] of cases) {
    const fixture = makeFixture(dbs.guard, type, lines);
    const samples = { guard: [], control: [] };
    for (let i = 0; i < 35; i++) {
      for (const kind of i % 2 ? ["guard", "control"] : ["control", "guard"]) {
        const ms = await pgWrite(pgClients[kind], candidate(fixture));
        if (i >= 5) samples[kind].push(ms);
      }
    }
    result.performance.push({ case: label, lines: fixture.items.length, warmupsPerDb: 5,
      guard: summary(samples.guard), control: summary(samples.control) });
    process.stdout.write(`PERF ${JSON.stringify(result.performance.at(-1))}\n`);
  }
}

try {
  for (const kind of ["guard", "control"]) await connectAndSeed(kind);
  await positivesAndNegatives();
  await prismaSemantics();
  await benchmark();
  const db = dbs.guard;
  const [audit] = await db.$queryRaw`SELECT count(*)::int AS incomplete FROM "Order"
    WHERE "source"='NETWORK_TEST' AND ("networkSnapshotSealedAt" IS NULL OR "cartSnapshot" IS NULL)`;
  if (audit.incomplete !== 0) throw new Error("Committed incomplete Network Order");
  result.finalAudit = { incompleteNetworkOrders: audit.incomplete,
    guardOrders: await db.order.count(), controlOrders: await dbs.control.order.count() };
  process.stdout.write(`STAGE6D3C3E_RESULT=${JSON.stringify(result)}\n`);
} finally {
  for (const client of Object.values(pgClients)) await client.end();
  for (const db of Object.values(dbs)) await db.$disconnect();
}
