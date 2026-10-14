import { INestApplication, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicMenuController } from "./public-menu.controller";
import { PublicWhatsappCheckoutService } from "./public-whatsapp-checkout.service";
import { PublicMenuService } from "./public-menu.service";

const databaseUrl = process.env.PUBLIC_MENU_RACE_TEST_DATABASE_URL;
const expectedDatabase = "ordersawa_stage3_stage6d3c1_public";
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55440" || parsed.pathname !== `/${expectedDatabase}`) {
    throw new Error("Stage 6D.3C1 tests refuse a non-disposable database URL");
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

  async function all(restaurantId = firstRestaurant) {
    return prisma.category.findUnique({ where: { restaurantId_slug: { restaurantId, slug: "all" } } });
  }

  beforeAll(async () => {
    await prisma.$connect();
    const [target] = await prisma.$queryRaw<{ name: string; address: string | null; port: number | null }[]>`
      SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port
    `;
    if (target?.name !== expectedDatabase || target.address !== "127.0.0.1" || target.port !== 55440) {
      throw new Error("Stage 6D.3C1 requires its dedicated disposable PostgreSQL database");
    }
    // Only the dedicated disposable database is touched, after verifying its actual identity.
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
        if (race && race.reads < race.expected && args.where?.restaurantId_slug?.slug === "all") {
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
    @Module({ controllers: [PublicMenuController], providers: [PublicMenuService, PublicWhatsappCheckoutService, FeatureFlagsService,
      { provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: { get: () => undefined } }] })
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

  it("creates all on the first HTTP menu request and keeps the legacy menu usable", async () => {
    const response = await menu();
    expect(response.status).toBe(200);
    expect(response.body.categories.map((entry: { slug: string }) => entry.slug)).toContain("all");
    expect(response.body.products.some((entry: { id: string }) => entry.id === productId)).toBe(true);
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
    expect(await all()).toMatchObject({ name: "الكل", sortOrder: 0, isActive: true, deletedAt: null });
  });

  it("serves both simultaneous first HTTP requests after both observe no all row", async () => {
    armRace(2);
    const responses = await Promise.all([menu(), menu()]);
    expect(race?.reads).toBe(2);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
  });

  it("serves eight simultaneous first HTTP requests with one category row", async () => {
    armRace(8);
    const responses = await Promise.all(Array.from({ length: 8 }, () => menu()));
    expect(race?.reads).toBe(8);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
  });

  it("leaves an existing healthy all row and its presentation fields intact", async () => {
    const existing = await prisma.category.create({ data: { restaurantId: firstRestaurant,
      slug: "all", name: "الكل", sortOrder: 0, isActive: true, color: "#112233", description: "Saved style" } });
    expect((await menu()).status).toBe(200);
    expect(await all()).toMatchObject({ id: existing.id, color: "#112233", description: "Saved style" });
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
  });

  it("restores a soft-deleted all row, preserving ID, product relation, and style", async () => {
    const existing = await prisma.category.create({ data: { restaurantId: firstRestaurant,
      slug: "all", name: "Old", sortOrder: 7, isActive: false, deletedAt: new Date(),
      color: "#123456", description: "Historic presentation" } });
    await prisma.product.update({ where: { id: productId }, data: { categoryId: existing.id } });
    const response = await menu();
    expect(response.status).toBe(200);
    expect(await all()).toMatchObject({ id: existing.id, name: "الكل", sortOrder: 0,
      isActive: true, deletedAt: null, color: "#123456", description: "Historic presentation" });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).categoryId).toBe(existing.id);
    expect(response.body.categories.some((entry: { id: string }) => entry.id === existing.id)).toBe(true);
    expect(await prisma.category.count({ where: { restaurantId: firstRestaurant, slug: "all" } })).toBe(1);
  });

  it("does not create an all row for another restaurant while serving the first", async () => {
    expect((await menu()).status).toBe(200);
    expect(await all(firstRestaurant)).not.toBeNull();
    expect(await all(secondRestaurant)).toBeNull();
    expect((await menu("s6d3c1-b")).status).toBe(200);
    expect((await all(secondRestaurant))?.id).not.toBe((await all(firstRestaurant))?.id);
    expect(await prisma.category.count({ where: { slug: "all" } })).toBe(2);
  });

  it("does not swallow an unrelated PostgreSQL foreign-key error", async () => {
    injectForeignKeyFailure = true;
    const response = await menu();
    expect(actualCreateFailureCode).toBe("P2003");
    expect(response.status).toBe(500);
    expect(await all()).toBeNull();
  });

  it("does not swallow an unrelated PostgreSQL primary-key uniqueness error", async () => {
    injectUnrelatedUniqueFailure = true;
    const response = await menu();
    expect(actualCreateFailureCode).toBe("P2002");
    expect(response.status).toBe(500);
    expect(await all()).toBeNull();
  });
});
