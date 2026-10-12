import {
  calculateMinimumPrice,
  ProductConfigurationV1,
  validateConfiguration
} from "@menu/shared";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  persistProductConfiguration,
  ProductConfigurationConflictError
} from "../src/modules/products/product-configuration.persistence";

export type LegacyProduct = Prisma.ProductGetPayload<{
  include: { options: { include: { options: true } } };
}>;

export type BackfillQuarantineRecord = {
  kind: "INVALID_LEGACY";
  productId: string;
  restaurantId: string;
  reasons: string[];
};

export type BackfillConflictRecord = {
  kind: "CONFLICT";
  productId: string;
  reason: string;
};

export type BackfillProgress = {
  database: string;
  mode: "DRY_RUN" | "EXECUTE";
  lastCursor: string | null;
  scanned: number;
  eligible: number;
  migrated: number;
  quarantined: number;
  conflicts: number;
};

export type BackfillOptions = {
  batchSize: number;
  resumeAfter?: string;
  maxProducts?: number;
  execute: boolean;
  confirmDatabase?: string;
  initialProgress?: BackfillProgress;
  onQuarantine?: (record: BackfillQuarantineRecord) => Promise<void> | void;
  onConflict?: (record: BackfillConflictRecord) => Promise<void> | void;
  onBatchComplete?: (progress: BackfillProgress) => Promise<void> | void;
};

export type LegacyConversion =
  | { status: "ELIGIBLE"; configuration: ProductConfigurationV1; minimumPrice: string | null }
  | { status: "SKIP"; reason: string }
  | { status: "QUARANTINE"; reasons: string[] };

function money(value: Prisma.Decimal | null) {
  return value === null ? null : value.toFixed(6);
}

export function convertLegacyProduct(product: LegacyProduct): LegacyConversion {
  if (!product.options.length) return { status: "SKIP", reason: "NO_LEGACY_GROUPS" };

  const reasons: string[] = [];
  const basePrice = money(product.basePrice);
  if (basePrice === null) reasons.push("Legacy product has null basePrice");

  let nodeCount = 0;
  const groups = product.options.map((group) => {
    nodeCount += 1 + group.options.length;
    const effectiveMin = Math.max(group.minSelect ?? 0, group.required ? 1 : 0);
    const effectiveMax = group.type === "SINGLE" ? 1 : (group.maxSelect ?? 100);

    if (!group.name.trim()) reasons.push(`${group.id}: blank group name`);
    if (group.minSelect !== null && group.minSelect < 0) reasons.push(`${group.id}: negative minSelect`);
    if (group.maxSelect !== null && group.maxSelect < 0) reasons.push(`${group.id}: negative maxSelect`);
    if (effectiveMin > effectiveMax) reasons.push(`${group.id}: min exceeds effective max`);
    if (group.type === "SINGLE" && group.maxSelect !== null && group.maxSelect !== 1) {
      reasons.push(`${group.id}: SINGLE maxSelect must be 1 or null`);
    }
    if (group.options.length < 1 || group.options.length > 100) {
      reasons.push(`${group.id}: option count must be between 1 and 100`);
    }
    if (effectiveMin > 0 && !group.options.some((option) => option.isActive)) {
      reasons.push(`${group.id}: required group has no active option`);
    }

    return {
      type: "OPTIONS" as const,
      id: group.id,
      label: group.name,
      min: effectiveMin,
      max: group.type === "SINGLE" ? 1 : group.maxSelect,
      includedQuantity: 0,
      options: group.options.map((option) => {
        if (!option.name.trim()) reasons.push(`${option.id}: blank option name`);
        if (option.priceDelta.isNegative()) reasons.push(`${option.id}: negative priceDelta`);
        return {
          id: option.id,
          label: option.name,
          price: option.priceDelta.toFixed(6),
          maxQuantity: effectiveMax,
          available: option.isActive
        };
      })
    };
  });

  if (nodeCount > 1000) reasons.push("Product node count exceeds 1000");
  if (reasons.length || basePrice === null) return { status: "QUARANTINE", reasons };

  const configuration: ProductConfigurationV1 = {
    schemaVersion: 1,
    productId: product.id,
    revision: 1,
    basePrice,
    groups
  };
  const validationIssues = validateConfiguration(configuration);
  if (validationIssues.length) {
    return {
      status: "QUARANTINE",
      reasons: validationIssues.map((issue) => `${issue.path}: ${issue.code}`)
    };
  }

  const minimum = calculateMinimumPrice(configuration, { catalogId: product.restaurantId });
  if (!minimum.orderable) {
    return {
      status: "QUARANTINE",
      reasons: minimum.issues.map((issue) => `${issue.path}: ${issue.code}`)
    };
  }
  return { status: "ELIGIBLE", configuration, minimumPrice: minimum.minimum };
}

function validateOptions(options: BackfillOptions) {
  if (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 1000) {
    throw new Error("batchSize must be an integer between 1 and 1000");
  }
  if (options.maxProducts !== undefined && (!Number.isSafeInteger(options.maxProducts) || options.maxProducts < 1)) {
    throw new Error("maxProducts must be a positive integer");
  }
}

export async function runProductConfigurationBackfill(
  prisma: PrismaClient,
  options: BackfillOptions
): Promise<BackfillProgress> {
  validateOptions(options);
  const [identity] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (!identity?.database) throw new Error("Could not determine database identity");
  if (options.execute && options.confirmDatabase !== identity.database) {
    throw new Error(
      `Write refused: --confirm-database must exactly equal '${identity.database}'`
    );
  }
  if (options.initialProgress && options.initialProgress.database !== identity.database) {
    throw new Error("Checkpoint database does not match the connected database");
  }
  const mode = options.execute ? "EXECUTE" : "DRY_RUN";
  if (options.initialProgress && options.initialProgress.mode !== mode) {
    throw new Error("Checkpoint mode does not match this run; use separate dry-run and execute checkpoints");
  }

  const progress: BackfillProgress = {
    database: identity.database,
    mode,
    lastCursor: options.resumeAfter ?? options.initialProgress?.lastCursor ?? null,
    scanned: options.initialProgress?.scanned ?? 0,
    eligible: options.initialProgress?.eligible ?? 0,
    migrated: options.initialProgress?.migrated ?? 0,
    quarantined: options.initialProgress?.quarantined ?? 0,
    conflicts: options.initialProgress?.conflicts ?? 0
  };
  let scannedThisRun = 0;

  while (options.maxProducts === undefined || scannedThisRun < options.maxProducts) {
    const remaining = options.maxProducts === undefined
      ? options.batchSize
      : Math.min(options.batchSize, options.maxProducts - scannedThisRun);
    const cursor = progress.lastCursor ?? "";
    const idRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p."id"
      FROM "Product" p
      WHERE p."configurationTree" IS NULL
        AND p."configurationVersion" = 0
        AND p."deletedAt" IS NULL
        AND p."id" > ${cursor}
        AND EXISTS (
          SELECT 1 FROM "ProductOptionGroup" g WHERE g."productId" = p."id"
        )
      ORDER BY p."id"
      LIMIT ${remaining}
    `);
    if (!idRows.length) break;

    const products = await prisma.product.findMany({
      where: { id: { in: idRows.map((row) => row.id) } },
      include: {
        options: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: { options: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } }
        }
      }
    });
    const productsById = new Map(products.map((product) => [product.id, product]));

    for (const row of idRows) {
      progress.lastCursor = row.id;
      progress.scanned += 1;
      scannedThisRun += 1;
      const product = productsById.get(row.id);
      if (!product) {
        progress.conflicts += 1;
        await options.onConflict?.({
          kind: "CONFLICT",
          productId: row.id,
          reason: "Product disappeared after the batch candidate query"
        });
        continue;
      }

      const conversion = convertLegacyProduct(product);
      if (conversion.status === "SKIP") continue;
      if (conversion.status === "QUARANTINE") {
        progress.quarantined += 1;
        await options.onQuarantine?.({
          kind: "INVALID_LEGACY",
          productId: product.id,
          restaurantId: product.restaurantId,
          reasons: conversion.reasons
        });
        continue;
      }

      progress.eligible += 1;
      if (!options.execute) continue;
      try {
        await persistProductConfiguration(prisma, {
          restaurantId: product.restaurantId,
          productId: product.id,
          expectedVersion: 0,
          configuration: conversion.configuration
        });
        progress.migrated += 1;
      } catch (error) {
        if (error instanceof ProductConfigurationConflictError) {
          progress.conflicts += 1;
          await options.onConflict?.({
            kind: "CONFLICT",
            productId: product.id,
            reason: error.message
          });
          continue;
        }
        throw error;
      }
    }

    await options.onBatchComplete?.({ ...progress });
    if (idRows.length < remaining) break;
  }

  return progress;
}
