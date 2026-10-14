import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
  Module,
  NotFoundException,
  ValidationPipe
} from "@nestjs/common";
import { ProductConfigurationV1 } from "@menu/shared";
import { PrismaClient } from "@prisma/client";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { NestFactory } from "@nestjs/core";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiResponseInterceptor } from "../../common/api-response.interceptor";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { DashboardService } from "../dashboard/dashboard.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicMenuService } from "../public-menu/public-menu.service";
import { PublicMenuController } from "../public-menu/public-menu.controller";
import { ProductConfigurationService } from "./product-configuration.service";
import { ProductsController } from "./products.controller";
import { ProductsImportService } from "./products-import.service";
import { ProductsService } from "./products.service";

const databaseUrl = process.env.PRODUCT_CONFIGURATION_TEST_DATABASE_URL;

if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  const safeHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!safeHost || parsed.port !== "55440" || !parsed.pathname.startsWith("/ordersawa_stage3_")) {
    throw new Error("Stage 3 integration tests refuse non-disposable database URLs");
  }
}

const integration = databaseUrl ? describe : describe.skip;

function baseConfiguration(productId: string, revision = 1, basePrice: string | null = null): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice,
    groups: [{
      type: "SIZE",
      id: `${productId}-sizes`,
      label: "Sizes",
      sizes: [
        { id: `${productId}-small`, label: "Small", price: "10.000001" },
        { id: `${productId}-large`, label: "Large", price: "15.999999" }
      ]
    }]
  };
}

function linkedConfiguration(
  productId: string,
  sourceProductId: string,
  revision = 1,
  mode: "ORIGINAL" | "CUSTOM" = "ORIGINAL"
): ProductConfigurationV1 {
  return {
    schemaVersion: 1,
    productId,
    revision,
    basePrice: "0",
    groups: [{
      type: "OPTIONS",
      id: `${productId}-combo`,
      label: "Combo",
      min: 1,
      max: 1,
      includedQuantity: 0,
      options: [{
        id: `${productId}-slot`,
        label: "Linked",
        price: "20.123456",
        maxQuantity: 1,
        linkedProduct: mode === "ORIGINAL"
          ? { sourceProductId, mode, originalPriceOverrides: { [`${sourceProductId}-small`]: "1.000001" } }
          : { sourceProductId, mode, customConfiguration: baseConfiguration(sourceProductId, 1, "3.000000") }
      }]
    }]
  };
}

function quotePizzaConfiguration(): ProductConfigurationV1 {
  return {
    schemaVersion: 1, productId: "quote-pizza", revision: 1, basePrice: null,
    groups: [
      { type: "SIZE", id: "quote-sizes", label: "Sizes", sizes: [
        { id: "quote-small", label: "Small", price: "100" },
        { id: "quote-medium", label: "Medium", price: "200.000001" }
      ] },
      { type: "OPTIONS", id: "quote-toppings", label: "Toppings", min: 0, max: 3, includedQuantity: 1, options: [{
        id: "quote-cheese", label: "Cheese", price: "30.000001", maxQuantity: 3,
        children: [{ type: "OPTIONS", id: "quote-sauces", label: "Sauces", min: 0, max: 1, includedQuantity: 0, options: [{ id: "quote-bbq", label: "BBQ", price: "5.000001", maxQuantity: 1 }] }]
      }] }
    ]
  };
}

function quotePizzaSelection(revision = 1) {
  return {
    schemaVersion: 1, productId: "quote-pizza", configurationRevision: revision,
    groups: [
      { type: "SIZE", groupId: "quote-sizes", sizeChoiceId: "quote-medium" },
      { type: "OPTIONS", groupId: "quote-toppings", instances: [
        { instanceId: "cheese-1", optionId: "quote-cheese", children: [{ type: "OPTIONS", groupId: "quote-sauces", instances: [{ instanceId: "sauce-1", optionId: "quote-bbq" }] }] },
        { instanceId: "cheese-2", optionId: "quote-cheese" },
        { instanceId: "cheese-3", optionId: "quote-cheese" }
      ] }
    ]
  };
}

function quoteComboConfiguration(): ProductConfigurationV1 {
  const custom: ProductConfigurationV1 = { schemaVersion: 1, productId: "quote-source", revision: 1, basePrice: null, groups: [{
    type: "SIZE", id: "custom-sizes", label: "Custom sizes", sizes: [{ id: "custom-one", label: "One", price: "7" }]
  }] };
  return { schemaVersion: 1, productId: "quote-combo", revision: 1, basePrice: "0", groups: [{
    type: "OPTIONS", id: "quote-slots", label: "Slots", min: 3, max: 3, includedQuantity: 0,
    options: [
      { id: "quote-original", label: "Original", price: "10", maxQuantity: 2, linkedProduct: { sourceProductId: "quote-source", mode: "ORIGINAL", originalPriceOverrides: { "source-small": "5", "source-large": "8" } } },
      { id: "quote-custom", label: "Custom", price: "3", maxQuantity: 1, linkedProduct: { sourceProductId: "quote-source", mode: "CUSTOM", customConfiguration: custom } }
    ]
  }] };
}

function quoteComboSelection() {
  return { schemaVersion: 1, productId: "quote-combo", configurationRevision: 1, groups: [{
    type: "OPTIONS", groupId: "quote-slots", instances: [
      { instanceId: "original-1", optionId: "quote-original", linkedSelection: { schemaVersion: 1, productId: "quote-source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-small" }] } },
      { instanceId: "original-2", optionId: "quote-original", linkedSelection: { schemaVersion: 1, productId: "quote-source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "source-sizes", sizeChoiceId: "source-large" }] } },
      { instanceId: "custom-1", optionId: "quote-custom", linkedSelection: { schemaVersion: 1, productId: "quote-source", configurationRevision: 1, groups: [{ type: "SIZE", groupId: "custom-sizes", sizeChoiceId: "custom-one" }] } }
    ]
  }] };
}

integration("Product Configuration Stage 3 disposable PostgreSQL integration", () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const featureFlags = new FeatureFlagsService(prisma as any);
  const service = new ProductConfigurationService(prisma as any, featureFlags);
  const productsService = new ProductsService(
    prisma as any,
    featureFlags,
    {} as any,
    { get: () => undefined } as any
  );
  const dashboardService = new DashboardService(prisma as any, featureFlags);
  const publicMenuService = new PublicMenuService(
    prisma as any,
    featureFlags,
    { get: () => undefined } as any
  );
  let httpApp: INestApplication;
  let httpOrigin: string;
  let ownerToken: string;
  let employeeToken: string;

  function postQuote(restaurantSlug: string, productId: string, body: unknown) {
    return fetch(`${httpOrigin}/public/menus/${restaurantSlug}/products/${productId}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.analyticsEvent.deleteMany();
    await prisma.productConfigurationDependency.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.restaurantMember.deleteMany();
    await prisma.user.deleteMany();
    await prisma.restaurantSubscription.deleteMany();
    await prisma.subscriptionFeature.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.restaurant.deleteMany();

    await prisma.restaurant.createMany({ data: [
      {
        id: "stage3-r1",
        name: "Restaurant One",
        slug: "stage3-r1",
        currency: "EGP",
        whatsappPhone: "201000000000"
      },
      { id: "stage3-r2", name: "Restaurant Two", slug: "stage3-r2", currency: "EGP" }
    ] });
    await prisma.subscriptionPlan.create({
      data: {
        id: "stage3-plan",
        name: "Stage 3 Test Plan",
        key: "STAGE3_TEST",
        features: {
          create: [
            { id: "stage3-feature", key: "PRODUCT_CONFIGURATION", enabled: true },
            { id: "stage3-whatsapp-feature", key: "WHATSAPP_ORDERING", enabled: true }
          ]
        }
      }
    });
    await prisma.restaurantSubscription.create({
      data: {
        id: "stage3-subscription",
        restaurantId: "stage3-r1",
        planId: "stage3-plan",
        status: "ACTIVE",
        startsAt: new Date("2026-01-01T00:00:00.000Z")
      }
    });

    const productIds = [
      "source-original",
      "source-custom",
      "owner-atomic",
      "owner-custom",
      "owner-rollback",
      "owner-concurrent",
      "cycle-b",
      "cycle-c",
      "owner-cycle",
      "owner-http",
      "legacy-null-zero",
      "legacy-null-price",
      "quote-pizza",
      "quote-source",
      "quote-combo"
    ];
    await prisma.product.createMany({
      data: productIds.map((id) => ({
        id,
        restaurantId: "stage3-r1",
        name: id,
        slug: id,
        basePrice: id === "legacy-null-zero" ? "0.000000" : id === "legacy-null-price" ? null : "7.000000",
        currency: "EGP"
      }))
    });
    await prisma.product.create({
      data: {
        id: "foreign-source",
        restaurantId: "stage3-r2",
        name: "Foreign",
        slug: "foreign-source",
        basePrice: "9.000000",
        currency: "EGP"
      }
    });
    await prisma.product.update({
      where: { id: "source-original" },
      data: {
        configurationTree: baseConfiguration("source-original"),
        configurationVersion: 1,
        basePrice: null,
        isAvailable: false
      }
    });
    await prisma.product.update({ where: { id: "quote-pizza" }, data: {
      configurationTree: quotePizzaConfiguration(), configurationVersion: 1, basePrice: null
    } });
    await prisma.product.update({ where: { id: "quote-source" }, data: {
      configurationTree: { schemaVersion: 1, productId: "quote-source", revision: 1, basePrice: null, groups: [{
        type: "SIZE", id: "source-sizes", label: "Source sizes", sizes: [
          { id: "source-small", label: "Small", price: "100" },
          { id: "source-large", label: "Large", price: "200" }
        ]
      }] }, configurationVersion: 1, basePrice: null
    } });
    await prisma.product.update({ where: { id: "quote-combo" }, data: {
      configurationTree: quoteComboConfiguration(), configurationVersion: 1, basePrice: "0"
    } });

    await prisma.user.createMany({
      data: [
        {
          id: "stage3-owner-user",
          email: "stage3-owner@example.test",
          passwordHash: "not-used",
          role: "USER"
        },
        {
          id: "stage3-employee-user",
          email: "stage3-employee@example.test",
          passwordHash: "not-used",
          role: "USER"
        }
      ]
    });
    await prisma.restaurantMember.createMany({
      data: [
        {
          id: "stage3-owner-membership",
          restaurantId: "stage3-r1",
          userId: "stage3-owner-user",
          role: "OWNER"
        },
        {
          id: "stage3-employee-membership",
          restaurantId: "stage3-r1",
          userId: "stage3-employee-user",
          role: "EMPLOYEE"
        }
      ]
    });

    @Module({
      imports: [JwtModule.register({ secret: randomBytes(32).toString("hex") })],
      controllers: [ProductsController, PublicMenuController],
      providers: [
        JwtAuthGuard,
        RestaurantContextGuard,
        FeatureFlagsService,
        ProductConfigurationService,
        { provide: PublicMenuService, useValue: publicMenuService },
        { provide: PrismaService, useValue: prisma },
        { provide: ProductsService, useValue: productsService },
        { provide: ProductsImportService, useValue: {} }
      ]
    })
    class ProductConfigurationHttpTestModule {}

    httpApp = await NestFactory.create(ProductConfigurationHttpTestModule, { logger: false });
    httpApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }));
    httpApp.useGlobalInterceptors(new ApiResponseInterceptor());
    await httpApp.listen(0, "127.0.0.1");
    const address = httpApp.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("HTTP E2E server did not expose a TCP address");
    httpOrigin = `http://127.0.0.1:${address.port}`;
    const jwt = httpApp.get(JwtService);
    ownerToken = await jwt.signAsync({
      sub: "stage3-owner-user",
      email: "stage3-owner@example.test",
      role: "USER"
    });
    employeeToken = await jwt.signAsync({
      sub: "stage3-employee-user",
      email: "stage3-employee@example.test",
      role: "USER"
    });
  });

  afterAll(async () => {
    await httpApp?.close();
    await prisma.$disconnect();
  });

  it("creates a hidden Network setup through the real Dashboard API, then saves and reloads its tree", async () => {
    const headers = {
      authorization: `Bearer ${ownerToken}`,
      "x-restaurant-id": "stage3-r1",
      "content-type": "application/json"
    };
    const createBody = { name: "Stage 6E Setup Pizza", basePrice: 12.5, currency: "EGP", configurationIntent: "NETWORK_SETUP" };
    const employee = await fetch(`${httpOrigin}/dashboard/products`, {
      method: "POST", headers: { ...headers, authorization: `Bearer ${employeeToken}` }, body: JSON.stringify(createBody)
    });
    expect(employee.status).toBe(403);
    expect(await employee.json()).toMatchObject({ error: "PRODUCT_CONFIGURATION_PERMISSION_DENIED" });

    const missingPrice = await fetch(`${httpOrigin}/dashboard/products`, {
      method: "POST", headers, body: JSON.stringify({ ...createBody, basePrice: undefined })
    });
    expect(missingPrice.status).toBe(400);
    const invalidIntent = await fetch(`${httpOrigin}/dashboard/products`, {
      method: "POST", headers, body: JSON.stringify({ ...createBody, configurationIntent: "UNKNOWN" })
    });
    expect(invalidIntent.status).toBe(400);

    await prisma.subscriptionFeature.update({ where: { id: "stage3-feature" }, data: { enabled: false } });
    const noCapability = await fetch(`${httpOrigin}/dashboard/products`, {
      method: "POST", headers, body: JSON.stringify(createBody)
    });
    expect(noCapability.status).toBe(403);
    await prisma.subscriptionFeature.update({ where: { id: "stage3-feature" }, data: { enabled: true } });

    const createdResponse = await fetch(`${httpOrigin}/dashboard/products`, {
      method: "POST", headers, body: JSON.stringify(createBody)
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()).data;
    expect(created).toMatchObject({ configurationMode: "LEGACY", configurationVersion: 0, basePrice: 12.5, isAvailable: false });
    const id = created.id as string;
    const patchIntent = await fetch(`${httpOrigin}/dashboard/products/${id}`, {
      method: "PATCH", headers, body: JSON.stringify({ configurationIntent: "NETWORK_SETUP", name: "Unexpected" })
    });
    expect(patchIntent.status).toBe(400);

    const initial = await fetch(`${httpOrigin}/dashboard/products/${id}/configuration`, { headers });
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({ data: { configurationVersion: 0, configurationTree: null, basePrice: "12.5" } });
    const hidden = await fetch(`${httpOrigin}/public/menus/stage3-r1/products/${id}/configuration`);
    expect(hidden.status).toBe(404);

    const tree = baseConfiguration(id);
    const save = await fetch(`${httpOrigin}/dashboard/products/${id}/configuration`, {
      method: "PUT", headers, body: JSON.stringify({ expectedVersion: 0, configuration: tree })
    });
    expect(save.status).toBe(200);
    expect(await save.json()).toMatchObject({ data: { configurationVersion: 1, mode: "NETWORK", basePrice: null, isAvailable: false } });
    const reload = await fetch(`${httpOrigin}/dashboard/products/${id}/configuration`, { headers });
    expect(await reload.json()).toMatchObject({ data: { configurationTree: tree, configurationVersion: 1, basePrice: null } });
    const stale = await fetch(`${httpOrigin}/dashboard/products/${id}/configuration`, {
      method: "PUT", headers, body: JSON.stringify({ expectedVersion: 0, configuration: tree })
    });
    expect(stale.status).toBe(409);

    const available = await fetch(`${httpOrigin}/dashboard/products/${id}/toggle-availability`, { method: "PATCH", headers });
    expect(available.status).toBe(200);
    const publicConfiguration = await fetch(`${httpOrigin}/public/menus/stage3-r1/products/${id}/configuration`);
    expect(publicConfiguration.status).toBe(200);
    expect(await publicConfiguration.json()).toMatchObject({ data: { configurationRevision: 1, previewOnly: true, orderable: true } });
    const quote = await postQuote("stage3-r1", id, { selection: {
      schemaVersion: 1, productId: id, configurationRevision: 1,
      groups: [{ type: "SIZE", groupId: `${id}-sizes`, sizeChoiceId: `${id}-small` }]
    } });
    expect(quote.status).toBe(200);
    expect(await quote.json()).toMatchObject({ data: { trustedTotal: "10.000001", baseIgnored: true } });
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).basePrice).toBeNull();
  });

  it("atomically creates and updates a network tree and dependency index", async () => {
    const first = await service.save("stage3-r1", "owner-atomic", {
      expectedVersion: 0,
      configuration: linkedConfiguration("owner-atomic", "source-original")
    });
    expect(first).toMatchObject({
      mode: "NETWORK",
      configurationVersion: 1,
      basePrice: "0",
      isAvailable: true
    });
    expect(await prisma.productConfigurationDependency.count({
      where: { productId: "owner-atomic", sourceProductId: "source-original", configurationVersion: 1 }
    })).toBe(1);

    const updatedTree = linkedConfiguration("owner-atomic", "source-original", 2);
    updatedTree.basePrice = null;
    const second = await service.save("stage3-r1", "owner-atomic", {
      expectedVersion: 1,
      configuration: updatedTree
    });
    expect(second).toMatchObject({ configurationVersion: 2, basePrice: null });
    expect(await prisma.productConfigurationDependency.count({
      where: { productId: "owner-atomic", configurationVersion: 2 }
    })).toBe(1);
  });

  it("persists CUSTOM snapshots while retaining a live source dependency", async () => {
    await service.save("stage3-r1", "owner-custom", {
      expectedVersion: 0,
      configuration: linkedConfiguration("owner-custom", "source-custom", 1, "CUSTOM")
    });
    const edge = await prisma.productConfigurationDependency.findFirstOrThrow({
      where: { productId: "owner-custom" }
    });
    expect(edge).toMatchObject({ sourceProductId: "source-custom", mode: "CUSTOM" });
  });

  it("rejects cross-restaurant, missing, self, and unconfigured ORIGINAL sources without partial writes", async () => {
    for (const sourceId of ["foreign-source", "missing-source"]) {
      await expect(service.save("stage3-r1", "owner-rollback", {
        expectedVersion: 0,
        configuration: linkedConfiguration("owner-rollback", sourceId)
      })).rejects.toBeInstanceOf(ConflictException);
    }
    try {
      await service.save("stage3-r1", "owner-rollback", {
        expectedVersion: 0,
        configuration: linkedConfiguration("owner-rollback", "source-custom")
      });
      throw new Error("Expected legacy ORIGINAL source rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        error: "ORIGINAL_LINKED_SOURCE_REQUIRES_NETWORK_CONFIGURATION",
        details: {
          sourceProductIds: ["source-custom"],
          allowedWithoutSourceConversion: ["CUSTOM"],
          requiresExplicitSourceConfigurationForOriginal: true
        }
      });
    }
    await expect(service.save("stage3-r1", "owner-rollback", {
      expectedVersion: 0,
      configuration: linkedConfiguration("owner-rollback", "owner-rollback")
    })).rejects.toHaveProperty("status", 400);

    const owner = await prisma.product.findUniqueOrThrow({ where: { id: "owner-rollback" } });
    expect(owner).toMatchObject({
      configurationTree: null,
      configurationVersion: 0,
      isAvailable: true
    });
    expect(owner.basePrice?.toString()).toBe("7");
    expect(await prisma.productConfigurationDependency.count({ where: { productId: "owner-rollback" } })).toBe(0);
  });

  it("detects a deep dependency cycle against existing edges", async () => {
    for (const id of ["cycle-b", "cycle-c"]) {
      await prisma.product.update({
        where: { id },
        data: { configurationTree: baseConfiguration(id), configurationVersion: 1, isAvailable: false }
      });
    }
    await prisma.productConfigurationDependency.createMany({ data: [
      {
        id: "cycle-edge-b-c",
        restaurantId: "stage3-r1",
        productId: "cycle-b",
        sourceProductId: "cycle-c",
        optionId: "b-to-c",
        path: "$configuration.groups[0].options[0]",
        mode: "ORIGINAL",
        configurationVersion: 1
      },
      {
        id: "cycle-edge-c-owner",
        restaurantId: "stage3-r1",
        productId: "cycle-c",
        sourceProductId: "owner-cycle",
        optionId: "c-to-owner",
        path: "$configuration.groups[0].options[0]",
        mode: "ORIGINAL",
        configurationVersion: 1
      }
    ] });

    await expect(service.save("stage3-r1", "owner-cycle", {
      expectedVersion: 0,
      configuration: linkedConfiguration("owner-cycle", "cycle-b")
    })).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "owner-cycle" } })).configurationVersion).toBe(0);
  });

  it("allows only one of two concurrent optimistic updates", async () => {
    const value = baseConfiguration("owner-concurrent", 1, "1.234567");
    const results = await Promise.allSettled([
      service.save("stage3-r1", "owner-concurrent", { expectedVersion: 0, configuration: value }),
      service.save("stage3-r1", "owner-concurrent", { expectedVersion: 0, configuration: value })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "owner-concurrent" } })).configurationVersion).toBe(1);
  });

  it("preserves stored data after capability loss and denies further writes", async () => {
    await prisma.subscriptionFeature.update({ where: { id: "stage3-feature" }, data: { enabled: false } });
    const readable = await service.get("stage3-r1", "owner-atomic");
    expect(readable).toMatchObject({
      mode: "NETWORK",
      capability: { canRead: true, canWrite: false },
      orderabilityState: "ACTION_REQUIRED_CAPABILITY"
    });
    await expect(service.save("stage3-r1", "owner-atomic", {
      expectedVersion: 2,
      configuration: linkedConfiguration("owner-atomic", "source-original", 3)
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "owner-atomic" } })).configurationVersion).toBe(2);
    expect(await publicMenuService.products("stage3-r1")).not.toContainEqual(
      expect.objectContaining({ id: "owner-atomic" })
    );
    await expect(publicMenuService.productConfiguration("stage3-r1", "owner-atomic"))
      .rejects.toBeInstanceOf(NotFoundException);
    await prisma.subscriptionFeature.update({ where: { id: "stage3-feature" }, data: { enabled: true } });
  });

  it("protects linked sources from service soft-delete and database hard-delete", async () => {
    await expect(productsService.delete("stage3-r1", "source-original")).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.product.delete({ where: { id: "source-original" } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("protects a category containing a linked source product", async () => {
    const category = await prisma.category.create({
      data: {
        id: "stage3-linked-category",
        restaurantId: "stage3-r1",
        name: "Linked products",
        slug: "stage3-linked-products"
      }
    });
    await prisma.product.update({ where: { id: "source-original" }, data: { categoryId: category.id } });
    await expect(dashboardService.deleteCategory("stage3-r1", category.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.category.findUniqueOrThrow({ where: { id: category.id } })).deletedAt).toBeNull();
  });

  it("publishes network products as preview-only while keeping legacy ordering blocked", async () => {
    const configured = await prisma.product.findUniqueOrThrow({ where: { id: "owner-atomic" } });
    expect(configured.isAvailable).toBe(true);

    const publicProducts = await publicMenuService.products("stage3-r1");
    expect(publicProducts).toContainEqual(expect.objectContaining({
      id: "owner-atomic",
      productConfiguration: expect.objectContaining({ mode: "NETWORK", previewOnly: true })
    }));
    expect(publicProducts).toContainEqual(expect.objectContaining({
      id: "legacy-null-zero",
      basePrice: 0
    }));
    expect(publicProducts).toContainEqual(expect.objectContaining({
      id: "legacy-null-price",
      basePrice: null
    }));
    const configuration = await publicMenuService.productConfiguration("stage3-r1", "owner-atomic");
    expect(configuration).toMatchObject({
      productId: "owner-atomic",
      previewOnly: true,
      orderAction: "STAGE_6_REQUIRED"
    });
    await expect(publicMenuService.createWhatsappOrder("stage3-r1", {
      items: [{ productSlug: "owner-atomic", quantity: 1 }]
    })).rejects.toBeInstanceOf(BadRequestException);
    const legacyOrder = await publicMenuService.createWhatsappOrder("stage3-r1", {
      items: [{ productSlug: "legacy-null-zero", quantity: 1 }]
    });
    expect(legacyOrder.orderId).toBeTruthy();
    await expect(publicMenuService.createWhatsappOrder("stage3-r1", {
      items: [{ productSlug: "legacy-null-price", quantity: 1 }]
    })).rejects.toBeInstanceOf(BadRequestException);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: "owner-atomic" } })).isAvailable).toBe(true);
  });

  it("serves the public configuration over HTTP without cross-tenant fallback", async () => {
    const response = await fetch(`${httpOrigin}/public/menus/stage3-r1/products/owner-atomic/configuration`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        productId: "owner-atomic",
        previewOnly: true,
        runtimeContext: { scope: "RESTAURANT", outletDifferentialApplied: false }
      }
    });

    const crossTenant = await fetch(`${httpOrigin}/public/menus/stage3-r1/products/foreign-source/configuration`);
    expect(crossTenant.status).toBe(404);
  });

  it("enforces authentication and configuration authorization over real HTTP", async () => {
    const unauthenticated = await fetch(`${httpOrigin}/dashboard/products/owner-http/configuration`);
    expect(unauthenticated.status).toBe(401);

    const forbidden = await fetch(`${httpOrigin}/dashboard/products/owner-http/configuration`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${employeeToken}`,
        "content-type": "application/json",
        "x-restaurant-id": "stage3-r1"
      },
      body: JSON.stringify({ expectedVersion: 0, configuration: baseConfiguration("owner-http") })
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: "PRODUCT_CONFIGURATION_PERMISSION_DENIED" });
  });

  it("enforces tenant isolation over real HTTP", async () => {
    const hidden = await fetch(`${httpOrigin}/dashboard/products/foreign-source/configuration`, {
      headers: { authorization: `Bearer ${ownerToken}`, "x-restaurant-id": "stage3-r1" }
    });
    expect(hidden.status).toBe(404);

    const spoofed = await fetch(`${httpOrigin}/dashboard/products/foreign-source/configuration`, {
      headers: { authorization: `Bearer ${ownerToken}`, "x-restaurant-id": "stage3-r2" }
    });
    expect(spoofed.status).toBe(403);
  });

  it("returns structured validation errors over real HTTP", async () => {
    const invalid = linkedConfiguration("owner-http", "owner-http");
    const response = await fetch(`${httpOrigin}/dashboard/products/owner-http/configuration`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "content-type": "application/json",
        "x-restaurant-id": "stage3-r1"
      },
      body: JSON.stringify({ expectedVersion: 0, configuration: invalid })
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "PRODUCT_CONFIGURATION_VALIDATION_FAILED",
      issues: expect.arrayContaining([expect.objectContaining({ code: "SELF_LINK" })])
    });
  });

  it("returns an optimistic revision conflict over real HTTP", async () => {
    const request = {
      method: "PUT",
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "content-type": "application/json",
        "x-restaurant-id": "stage3-r1"
      },
      body: JSON.stringify({ expectedVersion: 0, configuration: baseConfiguration("owner-http") })
    };
    const first = await fetch(`${httpOrigin}/dashboard/products/owner-http/configuration`, request);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ data: { mode: "NETWORK", configurationVersion: 1 } });

    const stale = await fetch(`${httpOrigin}/dashboard/products/owner-http/configuration`, request);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "PRODUCT_CONFIGURATION_CONFLICT" });
  });

  it("preserves legacy zero pricing and tenant isolation", async () => {
    const legacy = await productsService.findOne("stage3-r1", "legacy-null-zero");
    expect(legacy).toMatchObject({ basePrice: 0, configurationMode: "LEGACY", configurationVersion: 0 });
    await expect(service.get("stage3-r2", "owner-atomic")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("quotes a current size, nested sauce, and highest-unit inclusion through real HTTP", async () => {
    const response = await postQuote("stage3-r1", "quote-pizza", { selection: quotePizzaSelection() });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ data: {
      productId: "quote-pizza", trustedTotal: "265.000004", currency: "EGP", baseIgnored: true,
      configurationOrderable: true, previewOnly: true, orderingEnabled: false, orderAction: "STAGE_6_REQUIRED"
    } });
    expect(payload.data.priceBreakdown.filter((line: { included: boolean }) => line.included)).toHaveLength(1);
  });

  it("rejects client totals at any depth, invalid quantities, and stale revisions over HTTP", async () => {
    const tampered = await postQuote("stage3-r1", "quote-pizza", { selection: quotePizzaSelection(), total: "1" });
    expect(tampered.status).toBe(400);
    expect(await tampered.json()).toMatchObject({ error: "INVALID_QUOTE_REQUEST" });

    const nestedTamper = quotePizzaSelection() as any;
    nestedTamper.groups[0].price = "1";
    const nestedResponse = await postQuote("stage3-r1", "quote-pizza", { selection: nestedTamper });
    expect(nestedResponse.status).toBe(400);
    expect(await nestedResponse.json()).toMatchObject({ error: "INVALID_QUOTE_SELECTION", issues: expect.arrayContaining([expect.objectContaining({ code: "UNEXPECTED_SELECTION_FIELD" })]) });

    const wrongSize = quotePizzaSelection();
    wrongSize.groups[0] = { type: "SIZE", groupId: "quote-sizes", sizeChoiceId: "unknown" } as any;
    const invalidResponse = await postQuote("stage3-r1", "quote-pizza", { selection: wrongSize });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({ error: "INVALID_QUOTE_SELECTION", issues: expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_SIZE_SELECTION" })]) });

    const excessive = quotePizzaSelection() as any;
    excessive.groups[1].instances.push({ instanceId: "cheese-4", optionId: "quote-cheese" });
    const excessiveResponse = await postQuote("stage3-r1", "quote-pizza", { selection: excessive });
    expect(excessiveResponse.status).toBe(400);
    expect(await excessiveResponse.json()).toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: "GROUP_MAX_EXCEEDED" })]) });

    const stale = await postQuote("stage3-r1", "quote-pizza", { selection: quotePizzaSelection(0) });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "CONFIGURATION_REVISION_CHANGED", currentRevision: 1 });
  });

  it("quotes repeated ORIGINAL and CUSTOM linked instances without inheriting standalone sale prices", async () => {
    const response = await postQuote("stage3-r1", "quote-combo", { selection: quoteComboSelection() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { trustedTotal: "43", configurationOrderable: true } });

    await prisma.product.update({ where: { id: "quote-source" }, data: { isAvailable: false } });
    const unavailable = await postQuote("stage3-r1", "quote-combo", { selection: quoteComboSelection() });
    expect(unavailable.status).toBe(409);
    expect(await unavailable.json()).toMatchObject({ error: "CONFIGURATION_NOT_ORDERABLE", issues: expect.arrayContaining([expect.objectContaining({ code: "LINKED_PRODUCT_UNAVAILABLE" })]) });
    await prisma.product.update({ where: { id: "quote-source" }, data: { isAvailable: true } });

    const changedSource = await prisma.product.findUniqueOrThrow({ where: { id: "quote-source" } });
    await prisma.product.update({ where: { id: "quote-source" }, data: {
      configurationVersion: 2,
      configurationTree: { ...(changedSource.configurationTree as object), revision: 2 }
    } });
    const staleSource = await postQuote("stage3-r1", "quote-combo", { selection: quoteComboSelection() });
    expect(staleSource.status).toBe(409);
    expect(await staleSource.json()).toMatchObject({ error: "LINKED_CONFIGURATION_REVISION_CHANGED" });
  });

  it("enforces capability, owner availability, legacy exclusion, and tenant scoping over HTTP", async () => {
    const crossTenant = await postQuote("stage3-r1", "foreign-source", { selection: quotePizzaSelection() });
    expect(crossTenant.status).toBe(404);
    const legacy = await postQuote("stage3-r1", "legacy-null-zero", { selection: quotePizzaSelection() });
    expect(legacy.status).toBe(404);

    await prisma.subscriptionFeature.update({ where: { id: "stage3-feature" }, data: { enabled: false } });
    const disabled = await postQuote("stage3-r1", "quote-pizza", { selection: quotePizzaSelection() });
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE" });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "quote-pizza" } })).configurationVersion).toBe(1);
    await prisma.subscriptionFeature.update({ where: { id: "stage3-feature" }, data: { enabled: true } });

    await prisma.product.update({ where: { id: "quote-pizza" }, data: { isAvailable: false } });
    const unavailable = await postQuote("stage3-r1", "quote-pizza", { selection: quotePizzaSelection() });
    expect(unavailable.status).toBe(409);
    expect(await unavailable.json()).toMatchObject({ error: "PRODUCT_UNAVAILABLE" });
    await prisma.product.update({ where: { id: "quote-pizza" }, data: { isAvailable: true } });
  });

  it("detects unsatisfiable required groups and hides cross-restaurant linked sources", async () => {
    const impossible = quoteComboConfiguration();
    impossible.groups[0] = {
      type: "OPTIONS", id: "quote-slots", label: "Slots", min: 1, max: 1, includedQuantity: 0,
      options: [{ id: "foreign", label: "Foreign", price: "1", minQuantity: 1, maxQuantity: 1,
        linkedProduct: { sourceProductId: "foreign-source", mode: "CUSTOM", customConfiguration: { schemaVersion: 1, productId: "foreign-source", revision: 1, basePrice: "0", groups: [] } }
      }]
    };
    await prisma.product.update({ where: { id: "quote-combo" }, data: { configurationTree: impossible } });
    const response = await postQuote("stage3-r1", "quote-combo", { selection: quoteComboSelection() });
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload).toMatchObject({ error: "CONFIGURATION_NOT_ORDERABLE", issues: expect.arrayContaining([expect.objectContaining({ code: "LINK_TARGET_NOT_FOUND" })]) });
    expect(JSON.stringify(payload)).not.toContain("stage3-r2");
  });

  it("reloads current stored prices and revision instead of accepting an old displayed total", async () => {
    const updated = quotePizzaConfiguration();
    updated.revision = 2;
    if (updated.groups[0].type !== "SIZE") throw new Error("Fixture Size group missing");
    updated.groups[0].sizes[1].price = "210.000001";
    await prisma.product.update({ where: { id: "quote-pizza" }, data: {
      configurationTree: updated, configurationVersion: 2, basePrice: null
    } });

    const stale = await postQuote("stage3-r1", "quote-pizza", { selection: quotePizzaSelection() });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "CONFIGURATION_REVISION_CHANGED", currentRevision: 2 });

    const current = await postQuote("stage3-r1", "quote-pizza", { selection: quotePizzaSelection(2) });
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({ data: { trustedTotal: "275.000004", configurationRevision: 2 } });
  });
});
