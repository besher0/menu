import { randomUUID } from "node:crypto";
import {
  collectDependencyEdges,
  ProductConfigurationV1,
  validateConfiguration
} from "@menu/shared";
import { Prisma, PrismaClient } from "@prisma/client";

export class ProductConfigurationValidationError extends Error {
  constructor(readonly issues: ReturnType<typeof validateConfiguration>) {
    super("Product configuration validation failed");
  }
}

export class ProductConfigurationConflictError extends Error {}

export type PersistProductConfigurationInput = {
  restaurantId: string;
  productId: string;
  expectedVersion: number;
  configuration: ProductConfigurationV1;
};

type DependencyPair = {
  productId: string;
  sourceProductId: string;
};

export function findDependencyCycle(edges: readonly DependencyPair[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.productId) ?? [];
    targets.push(edge.sourceProductId);
    adjacency.set(edge.productId, targets);
  }

  const state = new Map<string, "VISITING" | "VISITED">();
  const stack: string[] = [];

  function visit(productId: string): string[] | null {
    state.set(productId, "VISITING");
    stack.push(productId);
    for (const sourceProductId of adjacency.get(productId) ?? []) {
      if (state.get(sourceProductId) === "VISITING") {
        const start = stack.indexOf(sourceProductId);
        return [...stack.slice(start), sourceProductId];
      }
      if (!state.has(sourceProductId)) {
        const cycle = visit(sourceProductId);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(productId, "VISITED");
    return null;
  }

  for (const productId of adjacency.keys()) {
    if (!state.has(productId)) {
      const cycle = visit(productId);
      if (cycle) return cycle;
    }
  }
  return null;
}

export async function persistProductConfiguration(
  prisma: PrismaClient,
  input: PersistProductConfigurationInput
) {
  if (input.configuration.productId !== input.productId) {
    throw new ProductConfigurationConflictError("Configuration productId does not match the target product");
  }
  if (input.configuration.revision <= input.expectedVersion) {
    throw new ProductConfigurationConflictError("Configuration revision must advance beyond expectedVersion");
  }

  const issues = validateConfiguration(input.configuration);
  if (issues.length) throw new ProductConfigurationValidationError(issues);

  const configurationTree = JSON.parse(JSON.stringify(input.configuration)) as Prisma.InputJsonValue;
  const edges = collectDependencyEdges(input.configuration);
  const uniqueSourceIds = [...new Set(edges.map((edge) => edge.sourceProductId))];

  return prisma.$transaction(async (transaction) => {
    const owner = await transaction.product.findFirst({
      where: {
        id: input.productId,
        restaurantId: input.restaurantId,
        deletedAt: null
      },
      select: { configurationVersion: true }
    });
    if (!owner) throw new ProductConfigurationConflictError("Product was not found in the requested restaurant");
    if (owner.configurationVersion !== input.expectedVersion) {
      throw new ProductConfigurationConflictError(
        `Configuration version conflict: expected ${input.expectedVersion}, found ${owner.configurationVersion}`
      );
    }

    if (uniqueSourceIds.length) {
      const sources = await transaction.product.findMany({
        where: {
          restaurantId: input.restaurantId,
          id: { in: uniqueSourceIds },
          deletedAt: null
        },
        select: { id: true }
      });
      const found = new Set(sources.map((source) => source.id));
      const missing = uniqueSourceIds.filter((sourceId) => !found.has(sourceId));
      if (missing.length) {
        throw new ProductConfigurationConflictError(
          `Linked products are missing or outside the restaurant: ${missing.join(", ")}`
        );
      }
    }

    const existingEdges = await transaction.productConfigurationDependency.findMany({
      where: {
        restaurantId: input.restaurantId,
        productId: { not: input.productId }
      },
      select: { productId: true, sourceProductId: true }
    });
    const cycle = findDependencyCycle([
      ...existingEdges,
      ...edges.map((edge) => ({ productId: input.productId, sourceProductId: edge.sourceProductId }))
    ]);
    if (cycle) {
      throw new ProductConfigurationConflictError(`Linked product cycle detected: ${cycle.join(" -> ")}`);
    }

    const updated = await transaction.product.updateMany({
      where: {
        id: input.productId,
        restaurantId: input.restaurantId,
        configurationVersion: input.expectedVersion,
        deletedAt: null
      },
      data: {
        basePrice:
          input.configuration.basePrice === null
            ? null
            : new Prisma.Decimal(input.configuration.basePrice),
        configurationTree,
        configurationVersion: input.configuration.revision
      }
    });
    if (updated.count !== 1) {
      throw new ProductConfigurationConflictError("Configuration changed while the transaction was running");
    }

    await transaction.productConfigurationDependency.deleteMany({
      where: { productId: input.productId }
    });
    if (edges.length) {
      await transaction.productConfigurationDependency.createMany({
        data: edges.map((edge) => ({
          id: randomUUID(),
          restaurantId: input.restaurantId,
          productId: input.productId,
          sourceProductId: edge.sourceProductId,
          optionId: edge.optionId,
          path: edge.path,
          mode: edge.mode,
          configurationVersion: input.configuration.revision
        }))
      });
    }

    return {
      productId: input.productId,
      configurationVersion: input.configuration.revision,
      dependencyCount: edges.length
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
