import "reflect-metadata";
import ExcelJS from "exceljs";
import { PRODUCT_IMPORT_COLUMNS } from "./import/product-import-parser";
import { randomBytes, randomUUID, randomInt } from "node:crypto";
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Module, ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@prisma/client";
import type { SaveProductEditor, ProductConfigurationV2 } from "@menu/shared";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { ProductEditorService } from "./product-editor.service";
import { ProductsService } from "./products.service";
import { ProductsController } from "./products.controller";
import { ProductsImportService } from "./products-import.service";
import { ProductConfigurationService } from "./product-configuration.service";
import { MediaService } from "../media/media.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RestaurantContextGuard } from "../../common/guards/restaurant-context.guard";
import { credentialVersion } from "../../common/security/session-credential";
import { ApiResponseInterceptor } from "../../common/api-response.interceptor";
import { PublicMenuService } from "../public-menu/public-menu.service";
import { DashboardController } from "../dashboard/dashboard.controller";
import { DashboardService } from "../dashboard/dashboard.service";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ConfigService } from "@nestjs/config";
import { static as staticFiles } from "express";
import { MediaController } from "../media/media.controller";
import { MediaStorageService } from "../media/media-storage.service";
import { ProductLibraryService } from "../media/product-library.service";
import { MediaWriteGuard } from "../media/media-write.guard";
import { BuilderController } from "../builder/builder.controller";
import { BuilderService } from "../builder/builder.service";
import { getUploadsDirectory } from "../../common/uploads-directory";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileTypeFromBuffer } from "file-type";

const url = process.env.UNIFIED_SAVE_TEST_DATABASE_URL;
describe.skipIf(!url)("Unified editor / disposable PostgreSQL + real authenticated HTTP", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const editor = new ProductEditorService(prisma as never);
  const flags = new FeatureFlagsService(prisma as never);
  const products = new ProductsService(prisma as never, flags, {} as never, { get: () => undefined } as never);
  const media = new MediaService(prisma as never, flags);
  let app: INestApplication, origin: string, owner: string, employee: string, admin: string;
  const config = (id: string, revision = 1): ProductConfigurationV2 => ({
    schemaVersion: 2, productId: id, revision, basePrice: "10", groups: []
  });
  const draft = (name = "Ordinary"): SaveProductEditor => ({
    create: true, expectedProductVersion: 0, expectedConfigurationVersion: 0,
    product: { name, description: "Test description", categoryId: "editor-c1", basePrice: "10",
      isNew: false, isFeatured: false, isPopular: true, moodKeys: ["happy"], images: [], ingredients: [], mealDetails: [] }
  });
  const existing = async (id: string): Promise<SaveProductEditor> => {
    const saved = await editor.read("editor-r1", id);
    return { create: false, expectedProductVersion: saved.editVersion,
      expectedConfigurationVersion: saved.configurationVersion, product: saved.product };
  };
  const put = (id: string, input: unknown, token = owner, tenant = "editor-r1") => fetch(origin + "/dashboard/products/" + id + "/editor", {
    method: "PUT", headers: { "Content-Type": "application/json", authorization: "Bearer " + token, "x-restaurant-id": tenant }, body: JSON.stringify(input)
  });

  beforeAll(async () => {
    if (!url) throw new Error("Explicit isolated database required");
    const parsed = new URL(url);
    if (parsed.hostname !== "127.0.0.1" || parsed.port !== process.env.UNIFIED_SAVE_TEST_PORT ||
      !/^\/unified_save_[a-f0-9]+$/.test(parsed.pathname)) throw new Error("Refusing non-disposable database");
    const directory = await prisma.$queryRawUnsafe<Array<{ data_directory: string }>>("SHOW data_directory");
    if (directory[0].data_directory.replaceAll("\\", "/").toLowerCase() !==
      process.env.UNIFIED_SAVE_TEST_DATA_DIRECTORY?.replaceAll("\\", "/").toLowerCase()) throw new Error("PostgreSQL identity mismatch");
    await prisma.restaurant.createMany({ data: [
      { id: "editor-r1", slug: "editor-r1", name: "Synthetic one", currency: "SYP" },
      { id: "editor-r2", slug: "editor-r2", name: "Synthetic two", currency: "USD" }
    ] });
    await prisma.category.createMany({ data: [
      { id: "editor-c1", restaurantId: "editor-r1", name: "One", slug: "one" },
      { id: "editor-c2", restaurantId: "editor-r2", name: "Two", slug: "two" }
    ] });
    // Pre-existing rows deliberately exceed the new editor limit; this is not a new-gallery API bypass.
    for (const width of [1280, 1440, 430, 390, 360]) await prisma.product.create({ data: {
      id: "fields-existing-six-" + width, restaurantId: "editor-r1", categoryId: "editor-c1", name: "DEMO ست صور قديمة", slug: "fields-six-" + width,
      basePrice: "6000", currency: "SYP", images: { create: ["demo-pizza-cheese.jpg", "demo-pizza-margherita.jpg", "demo-pizza-slices.jpg",
        "menu-products.png", "product-detail.png", "categories-shawarma.png"].map((file, sortOrder) => ({ url: "/assets/public/" + file, sortOrder })) }
    } });
    await prisma.subscriptionPlan.create({ data: { id: "editor-plan", name: "Synthetic", key: "editor-test",
      features: { create: ["PRODUCT_CONFIGURATION", "PRODUCT_IMAGES", "PRODUCT_3D_VIEWER", "PRODUCT_VR_VIEWER", "WHATSAPP_ORDERING"].map(key => ({ key, enabled: true })) } } });
    await prisma.restaurantSubscription.create({ data: { restaurantId: "editor-r1", planId: "editor-plan", status: "ACTIVE", startsAt: new Date() } });
    await prisma.ingredientLibraryItem.create({ data: { id: "editor-ingredient", adminName: "cheese", adminNameNormalized: "editor-cheese", displayName: "جبن" } });
    await prisma.mealDetailLibraryItem.createMany({ data: [
      { id: "editor-detail", adminName: "weight", adminNameNormalized: "editor-weight", displayName: "Weight", valueType: "VALUE" },
      { id: "editor-presence", adminName: "spicy", adminNameNormalized: "editor-spicy", displayName: "Spicy", valueType: "PRESENCE" }
    ] });
    await prisma.ingredientLibraryItem.create({ data: { id: "editor-ingredient-bbq", adminName: "BBQ", adminNameNormalized: "editor-bbq", displayName: "صوص BBQ", imageUrl: "/assets/public/demo-pizza-slices.jpg" } });
    await prisma.mealDetailLibraryItem.createMany({ data: [
      { id: "editor-value-demo", adminName: "DEMO weight", adminNameNormalized: "editor-demo-weight", displayName: "الوزن التقريبي", valueType: "VALUE", value: "قيمة مكتبة عامة", icon: "scale" },
      { id: "editor-presence-demo", adminName: "DEMO vegetarian", adminNameNormalized: "editor-demo-vegetarian", displayName: "مناسب للنباتيين", valueType: "PRESENCE", icon: "heart" }
    ] });
    await prisma.menu.create({ data: { restaurantId: "editor-r1", name: "DEMO", slug: "editor-demo", pages: {
      create: { title: "DEMO", slug: "home", isHome: true, sections: { create: { type: "MOOD_STRIP", sortOrder: 0,
        settings: { moodItems: [{ key: "cheese-lovers", label: "عشاق الجبنة" }, { label: "وجبة اليوم" }, { label: "BBQ" }] } } } }
    } } });
    const hash = randomBytes(32).toString("hex");
    await prisma.user.createMany({ data: [
      { id: "editor-admin", email: "admin@editor.invalid", passwordHash: hash, role: "SUPER_ADMIN" },
      { id: "editor-owner", email: "owner@editor.invalid", passwordHash: hash },
      { id: "editor-employee", email: "employee@editor.invalid", passwordHash: hash }
    ] });
    await prisma.restaurantMember.createMany({ data: [
      { userId: "editor-owner", restaurantId: "editor-r1", role: "OWNER" },
      { userId: "editor-employee", restaurantId: "editor-r1", role: "EMPLOYEE" }
    ] });
    @Module({
      imports: [JwtModule.register({ secret: randomBytes(32).toString("hex"), signOptions: { expiresIn: "1h" } })],
      controllers: [ProductsController, DashboardController, MediaController, BuilderController], providers: [
        JwtAuthGuard, RestaurantContextGuard, { provide: PrismaService, useValue: prisma },
        DashboardService, { provide: FeatureFlagsService, useValue: flags },
        MediaWriteGuard, ProductLibraryService, BuilderService,
        { provide: MediaStorageService, inject: [ConfigService], useFactory: (config: ConfigService) => {
          const storage = new MediaStorageService(config);
          // Vitest's VM cannot execute the CJS runtime's new Function(import(...)) loader.
          // Use the ACTUAL file-type implementation here, retaining real MIME/content validation, not a mock result.
          Object.defineProperty(storage, "detectFileType", { value: fileTypeFromBuffer });
          return storage;
        } },
        { provide: MediaService, useValue: media }, { provide: ConfigService, useValue: { get: (key: string) => key === "API_ORIGIN" ? origin : undefined } },
        { provide: ProductEditorService, useValue: editor }, { provide: ProductsService, useValue: products },
        ProductsImportService, { provide: ProductConfigurationService, useValue: {} }
      ]
    }) class EditorHttpModule {}
    app = await NestFactory.create(EditorHttpModule, { logger: false });
    app.getHttpAdapter().getInstance().use("/uploads", staticFiles(getUploadsDirectory()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    // Windows can allocate an ephemeral port reserved by Fetch (e.g. 6665-6669).
    // Reserve a free high port; do not relax Fetch's network restrictions.
    const reservation = createServer();
    let httpPort = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const candidate = randomInt(20_000, 60_000);
        await new Promise<void>((resolve, reject) => {
          reservation.once("error", reject);
          reservation.listen(candidate, "127.0.0.1", resolve);
        });
        httpPort = (reservation.address() as { port: number }).port;
        await new Promise<void>(resolve => reservation.close(() => resolve()));
        break;
      } catch { reservation.removeAllListeners("error"); }
    }
    if (!httpPort) throw new Error("No available isolated HTTP port");
    await app.listen(httpPort, "127.0.0.1");
    origin = "http://127.0.0.1:" + app.getHttpServer().address().port;
    try {
      expect((await fetch(origin + "/dashboard/products/browser-probe/editor")).status).toBe(401);
    } catch (error) {
      throw new Error("Isolated HTTP readiness failed: " + origin + " " + String((error as { cause?: unknown }).cause ?? error));
    }
    const jwt = app.get(JwtService);
    owner = await jwt.signAsync({ sub: "editor-owner", cv: credentialVersion(hash) });
    employee = await jwt.signAsync({ sub: "editor-employee", cv: credentialVersion(hash) });
    admin = await jwt.signAsync({ sub: "editor-admin", cv: credentialVersion(hash) });
  }, 30_000);
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); });

  it("restores the complete owner Dashboard routes with real role-scoped API responses", async () => {
    const call=async(path:string,method="GET",body?:unknown,token=owner,tenant="editor-r1")=>fetch(origin+path,{method,headers:{authorization:"Bearer "+token,"x-restaurant-id":tenant,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    for(const route of ["overview","products","categories","banners","settings","analytics","branches"]){
      expect((await call("/dashboard/"+route)).status,route).toBe(200);
      expect((await call("/dashboard/"+route,"GET",undefined,owner,"editor-r2")).status,route).toBe(403);
    }
    // Founder Preview had no branch, so there was no hours object for the UI to edit.
    expect((await (await call("/dashboard/settings")).json()).data.branch).toBeNull();
    const created=await call("/dashboard/branches","POST",{name:"Synthetic main",slug:"main"});expect(created.status).toBe(201);
    const settings=(await (await call("/dashboard/settings")).json()).data;
    expect(settings.branch.openingHours).toHaveLength(7);
    const hours=settings.branch.openingHours.map((h:any)=>({...h,opensAt:"10:30",closesAt:"21:45",isClosed:h.day===4}));
    expect((await call("/dashboard/settings","PATCH",{openingHours:hours},employee)).status).toBe(403);
    expect((await call("/dashboard/settings","PATCH",{openingHours:hours})).status).toBe(200);
    const persisted=(await (await call("/dashboard/settings")).json()).data.branch.openingHours;
    expect(persisted.map((h:any)=>({day:h.day,opensAt:h.opensAt,closesAt:h.closesAt,isClosed:h.isClosed}))).toEqual(hours.map((h:any)=>({day:h.day,opensAt:h.opensAt,closesAt:h.closesAt,isClosed:h.isClosed})));
    const categories=(await (await call("/dashboard/categories")).json()).data.data;
    const order=categories.map((c:any,i:number)=>({id:c.id,sortOrder:c.slug==="all"?0:i+1}));
    expect((await call("/dashboard/categories/reorder","PATCH",{items:order})).status).toBe(200);
    expect((await call("/dashboard/categories/reorder","PATCH",{items:order},employee)).status).toBe(403);
    // Creating/deleting categories remains an admin-only operation; this task does not expand permissions.
    expect((await call("/dashboard/categories","POST",{name:"Unauthorized",slug:"unauthorized"})).status).toBe(403);
    const banner=await call("/dashboard/banners","POST",{title:"Synthetic banner",imageUrl:"/assets/public/demo-pizza-cheese.jpg",isActive:true});expect(banner.status).toBe(201);
    const banners=(await banner.json()).data;const id=banners.find((x:any)=>x.title==="Synthetic banner").id;
    expect((await call("/dashboard/banners/"+id,"PATCH",{imageUrl:"/assets/public/demo-pizza-cheese.jpg",title:"Updated"})).status).toBe(200);
    expect((await call("/dashboard/banners/"+id,"DELETE")).status).toBe(200);
  });
  it("denies employee analytics and deletion over authenticated HTTP without changing data", async () => {
    const id = "employee-delete-boundary";
    await editor.save("editor-r1", id, draft());
    const headers = { authorization: "Bearer " + employee, "x-restaurant-id": "editor-r1" };
    expect((await fetch(origin + "/dashboard/overview", { headers })).status).toBe(403);
    expect((await fetch(origin + "/dashboard/products/" + id, { method: "DELETE", headers })).status).toBe(403);
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
  });

  it("preserves pre-migration ordinary rows, media, details and metadata", async () => {
    const row = await prisma.product.findUniqueOrThrow({ where: { id: "migration-p" }, include: { images: true } });
    expect(row.editVersion).toBe(0);
    expect(row.images[0].mediaId).toBe("migration-media");
    expect(row.nutrition).toMatchObject({ otherMetadata: "keep" });
    expect((await prisma.mealDetailLibraryItem.findUniqueOrThrow({ where: { id: "migration-detail" } })).valueType).toBe("VALUE");
  });
  it("creates an ordinary product through authenticated unified HTTP", async () => {
    const response = await put("editor-ordinary", draft());
    expect(response.status).toBe(200);
    const result = (await response.json()).data;
    expect(result).toMatchObject({ id: "editor-ordinary", editVersion: 1, configurationVersion: 0, currency: "SYP" });
    expect(result.product.images).toEqual([]);
  });
  it("creates Network V2 without an externally saved shell", async () => {
    const input = draft("Network");
    input.configuration = config("editor-network");
    const response = await put("editor-network", input);
    expect(response.status).toBe(200);
    const result = (await response.json()).data;
    expect(result.configuration).toEqual(input.configuration);
    expect(result.configurationVersion).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: result.id } })).isAvailable).toBe(false);
  });
  it("updates metadata without increasing configuration revision", async () => {
    const input = await existing("editor-network");
    input.product.description = "New description";
    const saved = await editor.save("editor-r1", "editor-network", input);
    expect(saved.editVersion).toBe(2); expect(saved.configurationVersion).toBe(1);
  });
  it("updates product and Network price atomically with consistency constraints enabled", async () => {
    const input = await existing("editor-network");
    input.product.name = "Changed Network"; input.product.basePrice = "20";
    input.configuration = { ...config("editor-network", 2), basePrice: "20" };
    const saved = await editor.save("editor-r1", "editor-network", input);
    expect(saved.configurationVersion).toBe(2); expect(saved.product.basePrice).toBe("20");
  });
  it("rejects stale product and configuration revisions with 409", async () => {
    const input = await existing("editor-network");
    input.expectedConfigurationVersion--;
    expect((await put("editor-network", input)).status).toBe(409);
    input.expectedConfigurationVersion++; input.expectedProductVersion--;
    expect((await put("editor-network", input)).status).toBe(409);
  });
  it("serializes concurrent edits and accepts exactly one", async () => {
    const input = await existing("editor-ordinary");
    const results = await Promise.all([put("editor-ordinary", input), put("editor-ordinary", input)]);
    expect(results.map(x => x.status).sort()).toEqual([200, 409]);
  });
  it("rolls back name, price, configuration, versions, dependency edges and images when the final write fails", async () => {
    const before = await editor.read("editor-r1", "editor-network");
    await prisma.$executeRawUnsafe('CREATE FUNCTION editor_reject_image() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."altText" = \'FAIL_AFTER_WRITE\' THEN RAISE EXCEPTION \'synthetic final write failure\'; END IF; RETURN NEW; END $$');
    await prisma.$executeRawUnsafe('CREATE TRIGGER editor_reject_image BEFORE INSERT ON "ProductImage" FOR EACH ROW EXECUTE FUNCTION editor_reject_image()');
    try {
      const input = await existing("editor-network");
      input.product.name = "Must roll back"; input.product.basePrice = "30";
      input.configuration = { ...config("editor-network", 3), basePrice: "30", groups: [{
        type: "OPTIONS", id: "rollback-group", label: "Linked", min: 0, max: 1, includedQuantity: 0,
        options: [{ id: "rollback-option", label: "Source", price: "0", maxQuantity: 1,
          linkedProduct: { mode: "CUSTOM", sourceProductId: "editor-ordinary", customConfiguration: config("editor-ordinary") } }]
      }] };
      input.product.images = [{ url: "https://example.test/failure.jpg", altText: "FAIL_AFTER_WRITE" }];
      await expect(editor.save("editor-r1", "editor-network", input)).rejects.toThrow();
      expect(await editor.read("editor-r1", "editor-network")).toEqual(before);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER editor_reject_image ON "ProductImage"');
      await prisma.$executeRawUnsafe('DROP FUNCTION editor_reject_image()');
    }
  });
  it("rejects duplicate creation after a lost response without creating a second row", async () => {
    const id = randomUUID();
    const input = draft("Stable create");
    expect((await put(id, input)).status).toBe(200);
    expect((await put(id, input)).status).toBe(409);
    expect(await prisma.product.count({ where: { id } })).toBe(1);
  });
  it("rejects reused foreign identities and cross-tenant reads", async () => {
    await prisma.product.create({ data: { id: "editor-foreign", restaurantId: "editor-r2", slug: "foreign", name: "Foreign", basePrice: "1" } });
    expect((await put("editor-foreign", draft())).status).toBe(409);
    await expect(editor.read("editor-r1", "editor-foreign")).rejects.toMatchObject({ status: 404 });
    expect((await put("editor-new-forbidden", draft(), owner, "editor-r2")).status).toBe(403);
  });
  it("rejects categories from a different tenant", async () => {
    const input = draft(); input.product.categoryId = "editor-c2";
    expect((await put("editor-bad-category", input)).status).toBe(400);
    expect(await prisma.product.count({ where: { id: "editor-bad-category" } })).toBe(0);
  });
  it("resolves library names server-side, supports VALUE/PRESENCE and preserves selection order", async () => {
    const input = await existing("editor-ordinary");
    input.product.ingredients = [{ libraryId: "editor-ingredient", name: "forged" }];
    input.product.mealDetails = [
      { libraryId: "editor-presence", label: "forged", value: "ignored", icon: "bad" },
      { libraryId: "editor-detail", label: "forged", value: "250 mg", icon: "bad" }
    ];
    const saved = await editor.save("editor-r1", "editor-ordinary", input);
    expect(saved.product.ingredients[0].name).toBe("جبن");
    expect(saved.product.mealDetails.map(x => [x.libraryId, x.value])).toEqual([["editor-presence", ""], ["editor-detail", "250 mg"]]);
    expect((await prisma.mealDetailLibraryItem.findUniqueOrThrow({ where: { id: "editor-detail" } })).value).toBeNull();
  });
  it("rejects unavailable, unknown and duplicate library identities", async () => {
    for (const ids of [["missing"], ["editor-ingredient", "editor-ingredient"]]) {
      const input = draft(); input.product.ingredients = ids.map(libraryId => ({ libraryId, name: "x" }));
      expect((await put(randomUUID(), input)).status).toBe(400);
    }
    await prisma.ingredientLibraryItem.update({ where: { id: "editor-ingredient" }, data: { isActive: false } });
    const input = draft(); input.product.ingredients = [{ libraryId: "editor-ingredient", name: "x" }];
    expect((await put(randomUUID(), input)).status).toBe(400);
    await prisma.ingredientLibraryItem.update({ where: { id: "editor-ingredient" }, data: { isActive: true } });
  });
  it("rejects missing, unvalidated and foreign media", async () => {
    await prisma.mediaAsset.create({ data: { restaurantId: "editor-r2", url: "/uploads/foreign.jpg", type: "IMAGE" } });
    for (const url of ["/uploads/missing.jpg", "/uploads/foreign.jpg", "javascript:alert(1)", "https://example.test/active.svg"]) {
      const input = draft(); input.product.images = [{ url, altText: "x" }];
      expect((await put(randomUUID(), input)).status).toBe(400);
    }
    const fakeIdentity = draft();
    fakeIdentity.product.images = [{ id: "another-product-image", url: "https://example.test/approved.jpg", altText: "x" }];
    expect((await put(randomUUID(), fakeIdentity)).status).toBe(400);
  });
  it("preserves ordered image references and media IDs across reopening without deleting assets", async () => {
    const asset = await prisma.mediaAsset.create({ data: { restaurantId: "editor-r1", url: "/uploads/editor-one.jpg", type: "IMAGE" } });
    const input = await existing("editor-ordinary");
    input.product.images = [{ url: "https://example.test/two.jpg", altText: "two" }, { url: asset.url, altText: "one" }];
    const saved = await editor.save("editor-r1", "editor-ordinary", input);
    expect(saved.product.images.map(({ url, altText }) => ({ url, altText }))).toEqual(input.product.images);
    expect(saved.primaryImageId).toBe(saved.product.images[0].id);
    const reordered = await existing(saved.id);
    reordered.product.images.reverse();
    const reopened = await editor.save("editor-r1", saved.id, reordered);
    expect(reopened.primaryImageId).toBe(saved.product.images[1].id);
    expect(reopened.product.images.map(x => x.id)).toEqual(saved.product.images.map(x => x.id).reverse());
    expect((await prisma.productImage.findMany({ where: { productId: saved.id }, orderBy: { sortOrder: "asc" } }))[0].mediaId).toBe(asset.id);
    const removal = await existing(saved.id); removal.product.images = [];
    await editor.save("editor-r1", saved.id, removal);
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(1);
  });
  it("rejects missing and foreign linked sources", async () => {
    for (const sourceProductId of ["missing", "editor-foreign"]) {
      const id = randomUUID(), input = draft();
      input.configuration = { ...config(id), groups: [{ type: "OPTIONS", id: "group", label: "Group", min: 0, max: 1,
        includedQuantity: 0, options: [{ id: "link", label: "Link", price: "0", maxQuantity: 1,
          linkedProduct: { sourceProductId, mode: "CUSTOM", customConfiguration: config(sourceProductId) } }] }] };
      expect((await put(id, input)).status).toBe(409);
      expect(await prisma.product.count({ where: { id } })).toBe(0);
    }
  });
  it("does not allow the ordinary price endpoint to bypass editVersion", async () => {
    const before = await editor.read("editor-r1", "editor-ordinary");
    await products.updatePrice("editor-r1", before.id, 15, before.editVersion);
    await expect(editor.save("editor-r1", before.id, {
      create: false, expectedProductVersion: before.editVersion, expectedConfigurationVersion: 0, product: before.product
    })).rejects.toMatchObject({ status: 409 });
    await expect(products.updatePrice("editor-r1", before.id, 16)).rejects.toMatchObject({ status: 400 });
    expect((await editor.read("editor-r1", before.id)).editVersion).toBe(before.editVersion + 1);
  });
  it("requires a version on legacy metadata writes and uses the same aggregate transaction", async () => {
    await expect(products.update("editor-r1", "editor-ordinary", { name: "Bypass" })).rejects.toMatchObject({ status: 400 });
    const saved = await editor.read("editor-r1", "editor-ordinary");
    await products.update("editor-r1", saved.id, { name: "Old route", expectedProductVersion: saved.editVersion });
    await expect(products.update("editor-r1", saved.id, { name: "Stale route", expectedProductVersion: saved.editVersion })).rejects.toMatchObject({ status: 409 });
  });
  it("imports only new products with an initial edit version, never upserts existing products", async () => {
    const input = { categoryId: "editor-c1", name: "Imported", basePrice: "50", currency: "SYP", isPopular: false,
      isNew: false, moodKeys: [], ingredients: [], nutrition: {}, images: [], sortOrder: 0 };
    const row = await prisma.$transaction(tx => products.createImportedProduct(tx, "editor-r1", input));
    expect(row.editVersion).toBe(1);
    const saved = await existing(row.id);
    saved.product.description = "Changed after import";
    expect((await editor.save("editor-r1", row.id, saved)).editVersion).toBe(2);
  });
  it("preserves availability, existing advanced media and unrelated nutrition on a metadata save", async () => {
    await prisma.product.update({ where: { id: "migration-p" }, data: { isFeatured: true, isNew: false } });
    await prisma.product3DModel.create({ data: { productId: "migration-p", url: "https://example.test/existing.glb", format: "GLB" } });
    const input = await editor.read("migration-r", "migration-p");
    await products.toggleAvailability("migration-r", "migration-p");
    await editor.save("migration-r", input.id, { create: false, expectedProductVersion: input.editVersion,
      expectedConfigurationVersion: 0, product: { ...input.product, description: "Edited" } });
    const row = await prisma.product.findUniqueOrThrow({ where: { id: input.id }, include: { media3d: true } });
    expect(row.isAvailable).toBe(false); expect(row.media3d?.url).toContain("existing.glb");
    expect(row.isFeatured).toBe(true); expect(row.isNew).toBe(false);
    expect(row.nutrition).toMatchObject({ otherMetadata: "keep" });
  });
  it("version-controls image and advanced-media attachment writers", async () => {
    const saved = await editor.read("editor-r1", "editor-ordinary");
    await media.attachImage("editor-r1", saved.id, { url: "https://example.test/new.jpg", expectedProductVersion: saved.editVersion });
    expect((await editor.read("editor-r1", saved.id)).editVersion).toBe(saved.editVersion + 1);
    await expect(media.attachImage("editor-r1", saved.id, { url: "https://example.test/stale.jpg", expectedProductVersion: saved.editVersion })).rejects.toMatchObject({ status: 409 });
    const model = "/uploads/editor-model.glb";
    await prisma.mediaAsset.create({ data: { restaurantId: "editor-r1", url: model, type: "MODEL_3D", provider: "CLOUDINARY", validatedFormat: "GLB" } });
    await media.attach3d("editor-r1", saved.id, { url: model, expectedProductVersion: saved.editVersion + 1 });
    expect((await editor.read("editor-r1", saved.id)).advancedMedia.model3dUrl).toBe(model);
  });
  it("checks HTTP authentication, roles and advanced media privileges", async () => {
    expect((await put(randomUUID(), draft(), "")).status).toBe(401);
    expect((await put(randomUUID(), draft(), employee)).status).toBe(403);
    const input = await existing("editor-network");
    input.configuration = config("editor-network", input.expectedConfigurationVersion + 1);
    input.product.basePrice = "10";
    expect((await put("editor-network", input, employee)).status).toBe(403);
    const ordinary = await existing("editor-ordinary");
    ordinary.advancedMedia = { model3dUrl: "", model3dFormat: "GLB", vrUrl: "" };
    expect((await put("editor-ordinary", ordinary)).status).toBe(403);
  });
  it("rejects invalid price precision, client-owned tenant/currency and malformed V2 without writing", async () => {
    const network = await existing("editor-network");
    network.product.basePrice = "999";
    expect((await put("editor-network", network)).status).toBe(400);
    const input = draft(); input.product.basePrice = "1.5";
    expect((await put(randomUUID(), input)).status).toBe(400);
    input.product.basePrice = "10";
    expect((await put(randomUUID(), { ...input, product: { ...input.product, currency: "USD" } })).status).toBe(400);
    expect((await put(randomUUID(), { ...input, configuration: { schemaVersion: 1 } })).status).toBe(400);
    expect((await put(randomUUID(), { ...input, advancedMedia: null })).status).toBe(400);
  });
  it("renders ordinary products through the existing public-menu service", async () => {
    const service = new PublicMenuService(prisma as never, flags, { get: () => undefined } as never);
    const result = await service.menu("editor-r1");
    expect(result.products.some(x => x.id === "editor-ordinary")).toBe(true);
    const ordinary = result.products.find(x => x.id === "editor-ordinary")!;
    expect(ordinary.name).toBe("Old route");
    expect(ordinary.basePrice).toBe(15);
  });
  it("keeps ordinary WhatsApp checkout server-priced on synthetic data, without sending a message", async () => {
    await prisma.restaurant.update({ where: { id: "editor-r1" }, data: { whatsappPhone: "000000000000" } });
    const service = new PublicMenuService(prisma as never, flags, { get: () => undefined } as never);
    const row = await prisma.product.findUniqueOrThrow({ where: { id: "editor-ordinary" } });
    const request = { items: [{ productSlug: row.slug, productId: row.id, expectedUnitPrice: row.basePrice!.toString(), quantity: 2 }], idempotencyKey: randomUUID(), fulfillmentType: "pickup" as const };
    const saved = await service.createWhatsappOrder("editor-r1", request);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: saved.orderId } });
    expect(order.totalAmount.toString()).toBe("30");
    expect(saved.message).toContain("Old route");
    expect(saved.message).toContain("30");
    expect((await service.createWhatsappOrder("editor-r1", request)).orderId).toBe(saved.orderId);
  });
  it("rejects linked dependency cycles inside a single aggregate transaction", async () => {
    const group = (sourceProductId: string): ProductConfigurationV2["groups"] => [{
      type: "OPTIONS", id: "cycle-g", label: "Link", min: 0, max: 1, includedQuantity: 0,
      options: [{ id: "cycle-o", label: "Target", price: "0", maxQuantity: 1,
        linkedProduct: { sourceProductId, mode: "CUSTOM", customConfiguration: config(sourceProductId) } }]
    }];
    await editor.save("editor-r1", "cycle-b", { ...draft("Cycle B"), configuration: config("cycle-b") });
    await editor.save("editor-r1", "cycle-a", { ...draft("Cycle A"), configuration: { ...config("cycle-a"), groups: group("cycle-b") } });
    const before = await editor.read("editor-r1", "cycle-b");
    const input = await existing("cycle-b");
    input.configuration = { ...config("cycle-b", 2), groups: group("cycle-a") };
    await expect(editor.save("editor-r1", "cycle-b", input)).rejects.toMatchObject({ status: 409 });
    expect(await editor.read("editor-r1", "cycle-b")).toEqual(before);
  });
  it("revalidates ORIGINAL consumers against a changed live source and rolls it back", async () => {
    const source = config("original-source");
    source.groups = [{ type: "SIZE", id: "source-size", label: "Sizes",
      sizes: [{ id: "source-small", label: "Small", price: "10" }] }];
    await editor.save("editor-r1", source.productId, { ...draft("Source"), configuration: source });
    const parent = config("original-parent");
    parent.groups = [{ type: "OPTIONS", id: "original-g", label: "Original", min: 0, max: 1, includedQuantity: 0,
      options: [{ id: "original-o", label: "Linked source", price: "0", maxQuantity: 1,
        linkedProduct: { sourceProductId: source.productId, mode: "ORIGINAL", originalPriceOverrides: { "source-small": { price: "3" } } } }] }];
    const saved = await editor.save("editor-r1", parent.productId, { ...draft("Parent"), configuration: parent });
    expect(saved.dependencies[0].sourceProductId).toBe(source.productId);
    const before = await editor.read("editor-r1", source.productId);
    const input = await existing(source.productId);
    input.configuration = { ...source, revision: 2, groups: [] };
    await expect(editor.save("editor-r1", source.productId, input)).rejects.toMatchObject({ status: 400 });
    expect(await editor.read("editor-r1", source.productId)).toEqual(before);
  });
  it("persists null Base with Sizes directly while rejecting V1 and mismatched database shapes", async () => {
    const id = randomUUID(), input = draft();
    input.product.basePrice = null;
    input.configuration = { ...config(id), basePrice: null, groups: [{ type: "SIZE", id: "s", label: "Sizes",
      sizes: [{ id: "small", label: "Small", price: "12" }] }] };
    const saved = await editor.save("editor-r1", id, input);
    expect(saved.product.basePrice).toBeNull(); expect(saved.configurationVersion).toBe(1);
    await expect(prisma.product.update({ where: { id }, data: { basePrice: "4" } })).rejects.toThrow();
    await expect(prisma.product.update({ where: { id }, data: { configurationTree: { ...input.configuration, schemaVersion: 1 } } })).rejects.toThrow();
  });
  it("keeps the configuration revision on an unchanged tree and compares Base prices numerically after reopening", async () => {
    const before = await editor.read("editor-r1", "editor-network");
    const input = await existing(before.id);
    input.product.description = "Metadata with unchanged tree";
    input.product.basePrice = "20.00";
    input.configuration = { ...before.configuration!, revision: before.configurationVersion + 1 };
    const saved = await editor.save("editor-r1", before.id, input);
    expect(saved.configurationVersion).toBe(before.configurationVersion);
    expect(saved.product.basePrice).toBe("20");
    expect(saved.product.description).toBe(input.product.description);
  });
  it("serves authorized library choices without allowing product owners to rewrite definitions", async () => {
    const headers = { authorization: "Bearer " + owner, "x-restaurant-id": "editor-r1", "content-type": "application/json" };
    const restaurant = await fetch(origin + "/dashboard/restaurants/current", { headers });
    expect((await restaurant.json()).data.currency).toBe("SYP");
    const response = await fetch(origin + "/dashboard/media/meal-details", { headers });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain("editor-value-demo");
    const before = await prisma.mealDetailLibraryItem.findUniqueOrThrow({ where: { id: "editor-value-demo" } });
    expect((await fetch(origin + "/dashboard/media/meal-details/editor-value-demo", { method: "PATCH", headers, body: JSON.stringify({ displayName: "forged" }) })).status).toBe(403);
    expect(await prisma.mealDetailLibraryItem.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });
  it("keeps independent flags and product-specific VALUE/PRESENCE without altering library defaults", async () => {
    const input = draft("DEMO صوص BBQ"), id = randomUUID();
    input.product.isFeatured = true; input.product.isNew = false; input.product.isPopular = false;
    input.product.mealDetails = [{ libraryId: "editor-value-demo", label: "forged", value: "450 غ", icon: "bad" },
      { libraryId: "editor-presence-demo", label: "forged", value: "", icon: "bad" }];
    expect((await put(id, input)).status).toBe(200);
    const next = await existing(id);next.product.isNew = true;next.product.isPopular = true;
    expect((await put(id, next)).status).toBe(200);
    const result = await editor.read("editor-r1", id);
    expect(result.product).toMatchObject({ isNew: true, isPopular: true, isFeatured: true });
    expect(result.product.mealDetails.map(x => [x.libraryId, x.value])).toEqual([["editor-value-demo", "450 غ"], ["editor-presence-demo", ""]]);
    expect((await prisma.mealDetailLibraryItem.findUniqueOrThrow({ where: { id: "editor-value-demo" } })).value).toBe("قيمة مكتبة عامة");
  });
  it.each([
    { moods:["cheese-lovers"], isNew:false, isPopular:false },
    { moods:["cheese-lovers","BBQ"], isNew:false, isPopular:false },
    { moods:[], isNew:false, isPopular:false },
    { moods:[], isNew:true, isPopular:false },
    { moods:["cheese-lovers"], isNew:false, isPopular:true },
    { moods:["BBQ"], isNew:true, isPopular:false },
    { moods:["cheese-lovers","BBQ"], isNew:true, isPopular:true }
  ])("preserves independent Mood/New/Popular over real HTTP: %j", async ({moods,isNew,isPopular}) => {
    const id=randomUUID(),input=draft("Mood fixture");
    Object.assign(input.product,{moodKeys:moods,isNew,isPopular,isFeatured:false});
    expect((await put(id,input)).status).toBe(200);
    const result=await editor.read("editor-r1",id);
    expect(result.product).toMatchObject({moodKeys:moods,isNew,isPopular,isFeatured:false});
    const reopened=await existing(id);reopened.product.description="unrelated edit";
    expect((await put(id,reopened)).status).toBe(200);
    expect((await editor.read("editor-r1",id)).product).toMatchObject({moodKeys:moods,isNew,isPopular,isFeatured:false});
  });
  it("uploads a real image with ownership and rejects forged content without pending-file residue", async () => {
    const headers = { authorization: "Bearer " + owner, "x-restaurant-id": "editor-r1" };
    const jpeg = readFileSync(resolve(process.cwd(), "../web/public/assets/public/demo-pizza-cheese.jpg"));
    const data = new FormData();data.append("file", new Blob([jpeg], { type: "image/jpeg" }), "demo.jpg");data.append("type", "IMAGE");
    const response = await fetch(origin + "/dashboard/media/upload", { method: "POST", headers, body: data });
    const body = await response.json();expect(response.status, JSON.stringify(body)).toBe(201); const asset = body.data;
    expect(asset.restaurantId).toBe("editor-r1");expect((await fetch(asset.url)).status).toBe(200);
    const pending = readdirSync(getUploadsDirectory()).filter(x => x.startsWith(".pending-"));
    const bad = new FormData();bad.append("file", new Blob(["not an image"], { type: "image/png" }), "forged.png");bad.append("type", "IMAGE");
    expect((await fetch(origin + "/dashboard/media/upload", { method: "POST", headers, body: bad })).status).toBe(400);
    expect(readdirSync(getUploadsDirectory()).filter(x => x.startsWith(".pending-"))).toEqual(pending);
  });
  it("enforces five new images while preserving and safely editing pre-existing larger galleries", async () => {
    const tooMany = draft();tooMany.product.images = Array.from({ length: 6 }, (_, i) => ({ url: "https://example.test/new-" + i + ".jpg", altText: "x" }));
    expect((await put(randomUUID(), tooMany)).status).toBe(400);
    const id = "fields-existing-six-1280", input = await existing(id);input.product.name = "DEMO preserved six";input.product.images.reverse();
    expect((await put(id, input)).status).toBe(200);const before = await editor.read("editor-r1", id);expect(before.product.images).toHaveLength(6);
    const replace = await existing(id);replace.product.images[0] = { url: "https://example.test/new-over-limit.jpg", altText: "new" };
    expect((await put(id, replace)).status).toBe(400);expect(await editor.read("editor-r1", id)).toEqual(before);
  });
  it("preserves existing advanced media through authenticated admin metadata save",async()=>{
    const id="admin-model-fixture",input=draft("Admin model fixture");
    expect((await put(id,input)).status).toBe(200);
    await prisma.mediaAsset.create({data:{restaurantId:"editor-r1",url:"https://example.test/demo-approved.glb",type:"MODEL_3D",provider:"CLOUDINARY",validatedFormat:"GLB"}});
    const current=await existing(id);current.advancedMedia={model3dUrl:"https://example.test/demo-approved.glb",model3dFormat:"GLB",vrUrl:""};
    expect((await put(id,current,admin)).status).toBe(200);
    expect((await editor.read("editor-r1",id)).advancedMedia.model3dFormat).toBe("GLB");
  });
  it("provides isolated 50/120-product catalogs, paginated search beyond the first page, and tenant isolation",async()=>{
    await prisma.category.create({data:{id:"management-category",restaurantId:"editor-r1",name:"إدارة QA",slug:"management-qa",sortOrder:90}});
    await prisma.product.createMany({data:[50,120].flatMap(count=>Array.from({length:count},(_,i)=>({id:`management-${count}-${i}`,restaurantId:"editor-r1",categoryId:"management-category",name:`QA Catalog${count} ${String(i).padStart(3,"0")} عربي`,slug:`qa-catalog${count}-${i}`,basePrice:100+i,currency:"SYP",sortOrder:1000+count*10+i})))});
    await prisma.product.create({data:{id:"management-other-tenant",restaurantId:"editor-r2",categoryId:"editor-c2",name:"QA Catalog120 119 عربي",slug:"other-tenant-search",basePrice:8,currency:"USD"}});
    const get=async(q:string)=>{const response=await fetch(origin+"/dashboard/products?"+q,{headers:{authorization:"Bearer "+owner,"x-restaurant-id":"editor-r1"}});expect(response.status).toBe(200);return (await response.json()).data};
    const network=await get("limit=10&page=1&search=Changed%20Network");
    expect(network.data.find((p:any)=>p.id==="editor-network")?.configurationPrice).toEqual({minimumPrice:null,priceDisplay:"UNAVAILABLE"});
    const availability=()=>fetch(origin+"/dashboard/products/editor-network/toggle-availability",{method:"PATCH",headers:{authorization:"Bearer "+owner,"x-restaurant-id":"editor-r1"}});
    expect((await availability()).status).toBe(200);
    try {const available=await get("limit=10&page=1&search=Changed%20Network");expect(available.data.find((p:any)=>p.id==="editor-network")?.configurationPrice).toEqual({minimumPrice:"20",priceDisplay:"EXACT"});}
    finally {expect((await availability()).status).toBe(200);}
    const first=await get("limit=10&page=1&sort=sortOrder&search=QA%20Catalog120");const second=await get("limit=10&page=2&sort=sortOrder&search=QA%20Catalog120");
    expect(first.meta.total).toBe(120);expect(first.data).toHaveLength(10);expect(second.data).toHaveLength(10);expect(new Set([...first.data,...second.data].map((p:any)=>p.id)).size).toBe(20);
    const found=await get("limit=10&page=1&search=119%20عربي");expect(found.data.map((p:any)=>p.id)).toEqual(["management-120-119"]);
    const denied=await fetch(origin+"/dashboard/products?search=QA",{headers:{authorization:"Bearer "+owner,"x-restaurant-id":"editor-r2"}});expect(denied.status).toBe(403);
  });
  it("preserves actual admin XLSX template/import/export and rejects owner access",async()=>{
    const headers=(jwt:string)=>({authorization:"Bearer "+jwt,"x-restaurant-id":"editor-r1"});
    const template=await fetch(origin+"/dashboard/products/import/template",{headers:headers(admin)});expect(template.status).toBe(200);
    const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await template.arrayBuffer()) as never);const sheet=book.getWorksheet("Products")!;
    expect(sheet.getRow(1).values).toEqual([undefined,...PRODUCT_IMPORT_COLUMNS]);sheet.getRow(2).values=["","QA Existing Import","One",450,"QA import",false,true,"","",""];
    const bytes=await book.xlsx.writeBuffer();const form=()=>{const value=new FormData();value.append("file",new Blob([bytes as never]),"isolated.xlsx");return value};
    const preview=await fetch(origin+"/dashboard/products/import/preview",{method:"POST",headers:headers(admin),body:form()});expect(preview.status,await preview.clone().text()).toBe(201);
    const imported=await fetch(origin+"/dashboard/products/import",{method:"POST",headers:headers(admin),body:form()});expect(imported.status,await imported.clone().text()).toBe(201);
    expect(await prisma.product.count({where:{restaurantId:"editor-r1",name:"QA Existing Import"}})).toBe(1);
    const exported=await fetch(origin+"/dashboard/products/export",{headers:headers(admin)});expect(exported.status).toBe(200);expect(exported.headers.get("content-type")).toContain("spreadsheetml");
    const output=new ExcelJS.Workbook();await output.xlsx.load(Buffer.from(await exported.arrayBuffer()) as never);expect(output.getWorksheet("Products")!.getRow(1).values).toEqual([undefined,...PRODUCT_IMPORT_COLUMNS]);
    expect(JSON.stringify(output.getWorksheet("Products")!.getSheetValues())).toContain("QA Existing Import");
    expect((await fetch(origin+"/dashboard/products/export",{headers:headers(owner)})).status).toBe(403);
    expect((await fetch(origin+"/dashboard/products/import/preview",{method:"POST",headers:headers(owner),body:form()})).status).toBe(403);
  });
  it("exposes Base editability for empty/optional Network without changing pricing or tenant scoping",async()=>{
    for(const kind of ["empty","optional","size","original-size","custom-size"]){
      const id="table-"+kind,configuration=config(id);
      if(kind==="optional")configuration.groups=[{type:"OPTIONS",id:"extras",label:"إضافات",min:0,max:null,includedQuantity:1,options:[{id:"cheese",label:"جبن",price:"5",maxQuantity:null}]}];
      if(kind==="size")configuration.groups=[{type:"SIZE",id:"sizes",label:"الحجم",sizes:[{id:"small",label:"صغير",price:"20"}]}];
      if(kind==="original-size"||kind==="custom-size")configuration.groups=[{type:"OPTIONS",id:"linked",label:"مشروب",min:0,max:1,includedQuantity:0,options:[{id:"drink",label:"مشروب",price:"0",maxQuantity:1,linkedProduct:kind==="original-size"?{sourceProductId:"table-size",mode:"ORIGINAL"}:{sourceProductId:"table-size",mode:"CUSTOM",customConfiguration:{...config("table-size"),groups:[{type:"SIZE",id:"custom-sizes",label:"حجم",sizes:[{id:"c-small",label:"صغير",price:"30"}]}]}}}]}];
      const input=draft("QA Table "+kind);input.configuration=configuration;expect((await put(id,input)).status).toBe(200);
    }
    const response=await fetch(origin+"/dashboard/products?search=QA%20Table&limit=100",{headers:{authorization:"Bearer "+owner,"x-restaurant-id":"editor-r1"}});
    expect(response.status).toBe(200);const rows=(await response.json()).data.data;
    for(const row of rows)expect(row.basePriceEditable).toBe(["table-empty","table-optional"].includes(row.id));
    expect(rows).toHaveLength(5);
    for(const id of ["table-empty","table-optional"]){
      const current=await editor.read("editor-r1",id),input=await existing(id);
      input.product.basePrice="200";input.configuration={...current.configuration!,revision:current.configurationVersion+1,basePrice:"200"};
      expect((await put(id,input)).status).toBe(200);
      const after=await editor.read("editor-r1",id);expect(after.product.basePrice).toBe("200");expect(after.configuration?.basePrice).toBe("200");
      expect(after.configuration?.groups).toEqual(current.configuration?.groups);expect(after.configurationVersion).toBe(2);
      expect((await put(id,input)).status).toBe(409);
      await prisma.product.update({where:{id},data:{isActive:true,isAvailable:true}});
    }
    const after=await fetch(origin+"/dashboard/products?search=QA%20Table&limit=100",{headers:{authorization:"Bearer "+owner,"x-restaurant-id":"editor-r1"}});
    const changed=(await after.json()).data.data;
    for(const id of ["table-empty","table-optional"])expect(changed.find((p:any)=>p.id===id).configurationPrice.minimumPrice).toBe("200");
  });
  it("keeps complete-category reorder, tenant and role guards while accepting a category subset",async()=>{
    const records=await prisma.product.findMany({where:{restaurantId:"editor-r1",categoryId:"management-category",deletedAt:null},orderBy:[{sortOrder:"asc"},{id:"asc"}]});
    const other=await prisma.product.findMany({where:{restaurantId:"editor-r1",categoryId:"editor-c1"},select:{id:true,sortOrder:true},orderBy:{id:"asc"}});
    const items=records.map((p,index)=>({id:p.id,sortOrder:index}));[items[0].sortOrder,items[1].sortOrder]=[1,0];
    const move=(value:unknown,jwt=owner)=>fetch(origin+"/dashboard/products/reorder",{method:"PATCH",headers:{authorization:"Bearer "+jwt,"x-restaurant-id":"editor-r1","content-type":"application/json"},body:JSON.stringify({items:value})});
    expect((await move(items.slice(0,10))).status).toBe(400);
    expect((await move(items,employee)).status).toBe(403);
    expect((await move([...items.slice(0,-1),{id:"management-other-tenant",sortOrder:items.length-1}])).status).toBe(400);
    expect((await move(items)).status).toBe(200);
    expect(await prisma.product.findMany({where:{restaurantId:"editor-r1",categoryId:"editor-c1"},select:{id:true,sortOrder:true},orderBy:{id:"asc"}})).toEqual(other);
    const after=await prisma.product.findMany({where:{restaurantId:"editor-r1",categoryId:"management-category",deletedAt:null},orderBy:{sortOrder:"asc"}});
    expect(after.map(x=>x.id)).toEqual([records[1].id,records[0].id,...records.slice(2).map(x=>x.id)]);
  });
  it("appends new Legacy and V2 products after the destination tail, excluding deleted/foreign rows",async()=>{
    await prisma.category.createMany({data:[{id:"order-destination",restaurantId:"editor-r1",name:"QA Tail",slug:"order-destination",sortOrder:95},{id:"order-empty",restaurantId:"editor-r1",name:"QA Empty",slug:"order-empty",sortOrder:96}]});
    await prisma.product.createMany({data:[{id:"tail-a",restaurantId:"editor-r1",categoryId:"order-destination",slug:"tail-a",name:"QA Tail A",basePrice:10,currency:"SYP",sortOrder:4},{id:"tail-b",restaurantId:"editor-r1",categoryId:"order-destination",slug:"tail-b",name:"QA Tail B",basePrice:10,currency:"SYP",sortOrder:8},{id:"tail-deleted",restaurantId:"editor-r1",categoryId:"order-destination",slug:"tail-deleted",name:"Deleted",basePrice:10,currency:"SYP",sortOrder:999,deletedAt:new Date()}]});
    let expected=9;
    for(const kind of ["legacy","empty-network","sizes"]){
      const id="tail-"+kind,input=draft("QA Tail "+kind);input.product.categoryId="order-destination";
      if(kind!=="legacy"){input.configuration=config(id);if(kind==="sizes")input.configuration.groups=[{type:"SIZE",id:"tail-size",label:"حجم",sizes:[{id:"small",label:"صغير",price:"20"}]}]}
      expect((await put(id,input)).status).toBe(200);expect((await prisma.product.findUniqueOrThrow({where:{id}})).sortOrder).toBe(expected++);
    }
    const first=draft("QA Empty first");first.product.categoryId="order-empty";expect((await put("tail-first-empty",first)).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({where:{id:"tail-first-empty"}})).sortOrder).toBe(0);
  });
  it("moves an existing product to the category tail and preserves rank on same-category metadata save",async()=>{
    const id="tail-first-empty",input=await existing(id);input.product.categoryId="order-destination";
    expect((await put(id,input)).status).toBe(200);expect((await prisma.product.findUniqueOrThrow({where:{id}})).sortOrder).toBe(12);
    const again=await existing(id);again.product.description="Metadata only";expect((await put(id,again)).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({where:{id}})).sortOrder).toBe(12);
    const foreign=await existing(id);foreign.product.categoryId="editor-c2";expect((await put(id,foreign)).status).toBe(400);
    expect((await prisma.product.findUniqueOrThrow({where:{id}})).categoryId).toBe("order-destination");
  });
  it("serializes simultaneous creates and legacy POST at the destination tail",async()=>{
    const inputs=["tail-concurrent-a","tail-concurrent-b"].map(id=>{const input=draft("QA Tail "+id);input.product.categoryId="order-destination";return {id,input}});
    const responses=await Promise.all(inputs.map(({id,input})=>put(id,input)));expect(responses.map(x=>x.status)).toEqual([200,200]);
    const ranks=await prisma.product.findMany({where:{id:{in:inputs.map(x=>x.id)}},select:{sortOrder:true},orderBy:{sortOrder:"asc"}});
    expect(ranks.map(x=>x.sortOrder)).toEqual([13,14]);
    const response=await fetch(origin+"/dashboard/products",{method:"POST",headers:{authorization:"Bearer "+owner,"x-restaurant-id":"editor-r1","content-type":"application/json"},body:JSON.stringify({name:"QA Tail old API",categoryId:"order-destination",basePrice:10,currency:"SYP"})});
    expect(response.status,await response.clone().text()).toBe(201);expect((await response.json()).data.sortOrder).toBe(15);
  });
  it.skipIf(!process.env.UNIFIED_V62_BROWSER_SCRIPT)("runs the V62 browser lifecycle against this isolated authenticated API", async () => {
    const script = process.env.UNIFIED_V62_BROWSER_SCRIPT!;
    const result = await promisify(execFile)(process.execPath, [script], {
      env: { ...process.env, UNIFIED_V62_API_ORIGIN: origin, UNIFIED_V62_OWNER_TOKEN: owner, UNIFIED_V62_ADMIN_TOKEN: admin },
      timeout: (process.env.V62_REFERENCE_HTML ? 900_000 : 480_000) + Number(process.env.UNIFIED_EDITOR_DEMO_SECONDS ?? 0) * 1000, windowsHide: true, maxBuffer: 1024 * 1024
    });
    expect(result.stdout).toContain("V62_BROWSER_PASS");
  }, (process.env.V62_REFERENCE_HTML ? 920_000 : 490_000) + Number(process.env.UNIFIED_EDITOR_DEMO_SECONDS ?? 0) * 1000);
});
