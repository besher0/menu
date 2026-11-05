import { ExecutionContext, INestApplication, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { DashboardController } from "../dashboard/dashboard.controller";
import { DashboardService } from "../dashboard/dashboard.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicMenuController } from "./public-menu.controller";
import { PublicWhatsappCheckoutService } from "./public-whatsapp-checkout.service";
import { PublicMenuService } from "./public-menu.service";

const databaseUrl = process.env.PUBLIC_MENU_RACE_TEST_DATABASE_URL;
const expectedDatabase = "ordersawa_stage3_stage6d3c1_public";
const NEON_SCHEMA = "ordersawa_public_menu_race_e2e";
const NEON_MARKER = "ordersawa:public-menu-race:e2e-disposable:2026-11-05";
const NEON_DIRECT_HOST = "ep-tiny-frost-b90v7e8c.c-7.eu-central-1.aws.neon.tech";
const NEON_SEARCH_PATH_OPTION = `-c search_path=${NEON_SCHEMA}`;

function approvedPublicMenuRaceNeonUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return process.env.NODE_ENV === "test"
      && process.env.PUBLIC_MENU_RACE_NEON_TESTS === "1"
      && process.env.GITHUB_ACTIONS !== "true"
      && ["postgresql:", "postgres:"].includes(parsed.protocol)
      && parsed.hostname === NEON_DIRECT_HOST
      && (parsed.port === "" || parsed.port === "5432")
      && parsed.pathname === "/neondb" && parsed.username === "neondb_owner"
      && parsed.password.length > 0
      && parsed.searchParams.getAll("schema").length === 1
      && parsed.searchParams.get("schema") === NEON_SCHEMA
      && parsed.searchParams.getAll("options").length === 1
      && parsed.searchParams.get("options") === NEON_SEARCH_PATH_OPTION
      && parsed.searchParams.get("sslmode") === "require"
      && parsed.searchParams.get("channel_binding") === "require";
  } catch {
    return false;
  }
}

if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  const local = parsed.hostname === "127.0.0.1" && parsed.port === "55440"
    && parsed.pathname === `/${expectedDatabase}`;
  if (!local && !approvedPublicMenuRaceNeonUrl(databaseUrl)) {
    throw new Error("Stage 6D.3C1 tests refuse an unexpected disposable database URL");
  }
  if (approvedPublicMenuRaceNeonUrl(databaseUrl)) {
    vi.setConfig({ testTimeout: 90_000, hookTimeout: 240_000 });
  }
}
const integration = databaseUrl ? describe : describe.skip;

integration("Stage 6D.3C1 Public Menu all-category HTTP regression", () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const firstRestaurant = "s6d3c1-first";
  const secondRestaurant = "s6d3c1-second";
  const productId = "s6d3c1-legacy-product";
  let app: INestApplication;
  let origin: string;
  let race: { expected: number; reads: number; wait: Promise<void>; release: () => void } | null = null;
  let injectForeignKeyFailure = false;
  let injectUnrelatedUniqueFailure = false;
  let actualCreateFailureCode: string | undefined;

  function armRace(expected: number) {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    race = { expected, reads: 0, wait, release };
  }

  async function menu(restaurant = "s6d3c1-a") {
    const response = await fetch(`${origin}/public/menus/${restaurant}?track=0`);
    return { status: response.status, body: await response.json() as Record<string, any> };
  }

  async function dashboardCategories(restaurantId = firstRestaurant) {
    const response = await fetch(`${origin}/dashboard/categories`, {
      headers: { "x-test-restaurant-id": restaurantId }
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  }

  async function all(restaurantId = firstRestaurant) {
    return prisma.category.findUnique({ where: { restaurantId_slug: { restaurantId, slug: "all" } } });
  }

  beforeAll(async () => {
    await prisma.$connect();
    // The fixture deletes data: verify the actual SQL target AND generated
    // Prisma model route into an explicitly marked dedicated schema before it.
    const [target] = await prisma.$queryRaw<{
      name: string; databaseUser: string; version: number; address: string | null;
      port: number | null; schemaName: string; searchSchemas: string[];
      schemaMarker: string | null; tableCount: number; resolvedTableCount: number;
    }[]>`
      SELECT current_database() AS name, current_user AS "databaseUser",
        current_setting('server_version_num')::int AS version,
        host(inet_server_addr()) AS address, inet_server_port() AS port,
        current_schema() AS "schemaName",
        current_schemas(false)::text[] AS "searchSchemas",
        obj_description(current_schema()::regnamespace, 'pg_namespace') AS "schemaMarker",
        (SELECT count(*)::int FROM pg_tables WHERE schemaname = current_schema()) AS "tableCount",
        (SELECT count(*)::int FROM pg_tables t WHERE t.schemaname = current_schema()
          AND to_regclass(format('%I', t.tablename)) =
              to_regclass(format('%I.%I', current_schema(), t.tablename))) AS "resolvedTableCount"
    `;
    if (approvedPublicMenuRaceNeonUrl(databaseUrl)) {
      if (!target || target.name !== "neondb" || target.databaseUser !== "neondb_owner"
        || target.version !== 180006 || target.schemaName !== NEON_SCHEMA
        || !Array.isArray(target.searchSchemas) || target.searchSchemas[0] !== NEON_SCHEMA
        || target.searchSchemas.some((name) => name !== NEON_SCHEMA && name !== "public")
        || target.schemaMarker !== NEON_MARKER
        || target.tableCount !== 34 || target.resolvedTableCount !== 34) {
        throw new Error("Refusing public-menu race E2E cleanup: unexpected isolated Neon schema "
          + JSON.stringify({
            database: target?.name, databaseUser: target?.databaseUser, version: target?.version,
            schemaName: target?.schemaName, searchSchemas: target?.searchSchemas,
            schemaMarker: target?.schemaMarker, tableCount: target?.tableCount,
            resolvedTableCount: target?.resolvedTableCount
          }));
      }

      const canaryId = `s6d3c1-schema-routing-${randomUUID()}`;
      await prisma.$executeRaw`
        INSERT INTO "ordersawa_public_menu_race_e2e"."Restaurant" ("id", "name", "slug", "updatedAt")
        VALUES (${canaryId}, 'Public Menu Race isolated routing canary', ${canaryId}, NOW())
      `;
      try {
        const found = await prisma.restaurant.findUnique({ where: { id: canaryId }, select: { id: true } });
        if (found?.id !== canaryId) {
          throw new Error("Refusing public-menu race E2E cleanup: Prisma query is not isolated");
        }
      } finally {
        await prisma.$executeRaw`
          DELETE FROM "ordersawa_public_menu_race_e2e"."Restaurant" WHERE "id" = ${canaryId}
        `;
      }
    } else if (!target || target.name !== expectedDatabase
      || target.address !== "127.0.0.1" || target.port !== 55440) {
      throw new Error("Stage 6D.3C1 requires its dedicated disposable PostgreSQL database");
    }

    // Only the dedicated disposable database is touched after both checks.
    await prisma.product.deleteMany({ where: { restaurantId: { in: [firstRestaurant, secondRestaurant] } } });
    await prisma.category.deleteMany({ where: { restaurantId: { in: [firstRestaurant, secondRestaurant] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [firstRestaurant, secondRestaurant] } } });
    await prisma.restaurant.createMany({ data: [
      { id: firstRestaurant, slug: "s6d3c1-a", name: "First disposable restaurant", currency: "EGP" },
      { id: secondRestaurant, slug: "s6d3c1-b", name: "Second disposable restaurant", currency: "EGP" }
    ] });
    await prisma.category.create({ data: { id: "s6d3c1-regular", restaurantId: firstRestaurant,
      slug: "pizza", name: "Pizza", sortOrder: 1 } });
    await prisma.product.create({ data: { id: productId, restaurantId: firstRestaurant,
      categoryId: "s6d3c1-regular", slug: "legacy-pizza", name: "Legacy Pizza",
      currency: "EGP", basePrice: "12" } });

    const category = {
      findUnique: async (args: Parameters<typeof prisma.category.findUnique>[0]) => {
        const result = await prisma.category.findUnique(args);
        if (race && race.reads < race.expected
          && args.where?.restaurantId_slug?.slug === "all"
          && args.where.restaurantId_slug.restaurantId === firstRestaurant) {
          const gate = race;
          gate.reads += 1;
          if (gate.reads === gate.expected) gate.release();
          await gate.wait; // Force all HTTP requests to observe the absent row before INSERT.
        }
        return result;
      },
      create: async (args: Parameters<typeof prisma.category.create>[0]) => {
        try {
          if (injectForeignKeyFailure) {
            return await prisma.category.create({
              data: { ...(args.data as Prisma.CategoryUncheckedCreateInput), restaurantId: "s6d3c1-missing" }
            });
          }
          if (injectUnrelatedUniqueFailure) {
            return await prisma.category.create({
              data: { ...(args.data as Prisma.CategoryUncheckedCreateInput), id: "s6d3c1-regular" }
            });
          }
          return await prisma.category.create(args);
        } catch (error) {
          actualCreateFailureCode = (error as { code?: string }).code;
          throw error;
        }
      },
      update: (args: Parameters<typeof prisma.category.update>[0]) => prisma.category.update(args)
    };
    const db = new Proxy(prisma, {
      get(target, key) { return key === "category" ? category : Reflect.get(target, key, target); }
    });
    @Module({
      controllers: [PublicMenuController, DashboardController],
      providers: [
        PublicMenuService, PublicWhatsappCheckoutService, FeatureFlagsService, DashboardService,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: { get: () => undefined } },
        // Exercise the real DashboardController and DashboardService via HTTP.
        // Auth and restaurant context are mocked for this isolated race suite.
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
        { provide: RestaurantContextGuard, useValue: {
          canActivate: (context: ExecutionContext) => {
            const request = context.switchToHttp().getRequest<{
              headers: Record<string, string | string[] | undefined>;
              restaurant?: { id: string };
            }>();
            const id = request.headers["x-test-restaurant-id"];
            if (id !== firstRestaurant && id !== secondRestaurant) return false;
            request.restaurant = { id };
            return true;
          }
        } }
      ]
    })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });

  beforeEach(async () => {
    race = null;
    injectForeignKeyFailure = false;
    injectUnrelatedUniqueFailure = false;
    actualCreateFailureCode = undefined;
    await prisma.product.update({ where: { id: productId }, data: { categoryId: "s6d3c1-regular" } });
    await prisma.category.deleteMany({ where: { slug: "all", restaurantId: { in: [firstRestaurant, secondRestaurant] } } });
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  it("keeps public menu GET read-only and creates all via dashboard categories HTTP", async () => {
    const publicBefore = await menu();
    expect(publicBefore.status).toBe(200);
    expect(publicBefore.body.categories.map((entry: { slug: string }) => entry.slug)).toEqual(["pizza"]);
    expect(publicBefore.body.products.some((entry: { id: string }) => entry.id === productId)).toBe(true);
    expect(await all()).toBeNull();

    const dashboard = await dashboardCategories();
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.map((entry: { slug: string }) => entry.slug)).toContain("all");
    expect(await all()).toMatchObject({ name: "الكل", sortOrder: 0, isActive: true, deletedAt: null });
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);

    const publicAfter = await menu();
    expect(publicAfter.status).toBe(200);
    expect(publicAfter.body.categories.map((entry: { slug: string }) => entry.slug)).toContain("all");
  });

  it("serves two concurrent first dashboard GETs after both see no all category", async () => {
    armRace(2);
    const responses = await Promise.all([dashboardCategories(), dashboardCategories()]);
    expect(race?.reads).toBe(2);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
  });

  it("serves eight concurrent first dashboard GETs with only one all category", async () => {
    armRace(8);
    const responses = await Promise.all(Array.from({ length: 8 }, () => dashboardCategories()));
    expect(race?.reads).toBe(8);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
  });

  it("preserves an existing healthy all category and its presentation fields", async () => {
    const existing = await prisma.category.create({ data: { restaurantId: firstRestaurant,
      slug: "all", name: "الكل", sortOrder: 0, isActive: true, color: "#112233", description: "Saved style" } });
    expect((await dashboardCategories()).status).toBe(200);
    expect(await all()).toMatchObject({ id: existing.id, color: "#112233", description: "Saved style" });
    expect((await menu()).body.categories.some((entry: { id: string }) => entry.id === existing.id)).toBe(true);
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
  });

  it("restores a soft-deleted all category through dashboard without changing ID, relation or style", async () => {
    const existing = await prisma.category.create({ data: { restaurantId: firstRestaurant,
      slug: "all", name: "Old", sortOrder: 7, isActive: false, deletedAt: new Date(),
      color: "#123456", description: "Historic presentation" } });
    await prisma.product.update({ where: { id: productId }, data: { categoryId: existing.id } });
    const publicBefore = await menu();
    expect(publicBefore.status).toBe(200);
    expect(publicBefore.body.categories.some((entry: { slug: string }) => entry.slug === "all")).toBe(false);

    const response = await dashboardCategories();
    expect(response.status).toBe(200);
    expect(await all()).toMatchObject({ id: existing.id, name: "الكل", sortOrder: 0,
      isActive: true, deletedAt: null, color: "#123456", description: "Historic presentation" });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).categoryId).toBe(existing.id);
    expect((await menu()).body.categories.some((entry: { id: string }) => entry.id === existing.id)).toBe(true);
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
  });

  it("isolates dashboard all categories by restaurant; public GET never initializes them", async () => {
    expect((await menu()).status).toBe(200);
    expect(await all(firstRestaurant)).toBeNull();
    expect((await dashboardCategories(firstRestaurant)).status).toBe(200);
    expect(await all(firstRestaurant)).not.toBeNull();
    expect(await all(secondRestaurant)).toBeNull();
    expect((await menu("s6d3c1-b")).status).toBe(200);
    expect(await all(secondRestaurant)).toBeNull();
    expect((await dashboardCategories(secondRestaurant)).status).toBe(200);
    expect((await all(secondRestaurant))?.id).not.toBe((await all(firstRestaurant))?.id);
    expect(await prisma.category.count({ where: { slug: "all" } })).toBe(2);
  });

  it("does not swallow an unrelated PostgreSQL foreign-key error on dashboard creation", async () => {
    injectForeignKeyFailure = true;
    const response = await dashboardCategories();
    expect(actualCreateFailureCode).toBe("P2003");
    expect(response.status).toBe(500);
    expect(await all()).toBeNull();
  });

  it("does not swallow an unrelated PostgreSQL primary-key error on dashboard creation", async () => {
    injectUnrelatedUniqueFailure = true;
    const response = await dashboardCategories();
    expect(actualCreateFailureCode).toBe("P2002");
    expect(response.status).toBe(500);
    expect(await all()).toBeNull();
  });
});
