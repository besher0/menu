import { randomUUID } from "node:crypto";
import {
  collectDependencyEdgesV2 as collectDependencyEdges,
  type FeatureKey,
  ProductConfigurationV2,
  ProductConfigurationV1,
  validateConfigurationV2 as validateConfiguration,
  validateConfiguration as rejectRetiredConfiguration,
  validateGroupLevelsV2 as validateGroupLevels,
  resolveConfigurationContextV2,
  validateConfigurationCurrencyV2 as validateConfigurationCurrency
} from "@menu/shared";
import { Prisma, PrismaClient } from "@prisma/client";

export class ProductConfigurationValidationError extends Error {
  readonly kind = "PRODUCT_CONFIGURATION_VALIDATION" as const;

  constructor(readonly issues: ReturnType<typeof validateConfiguration>) {
    super("Product configuration validation failed");
  }
}

export class ProductConfigurationConflictError extends Error {
  readonly kind = "PRODUCT_CONFIGURATION_CONFLICT" as const;

  constructor(
    message: string,
    readonly code = "PRODUCT_CONFIGURATION_CONFLICT",
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export class ProductConfigurationCapabilityError extends Error {
  readonly kind = "PRODUCT_CONFIGURATION_CAPABILITY_DENIED" as const;
}

export type PersistProductConfigurationInput = {
  restaurantId: string;
  productId: string;
  expectedVersion: number;
  configuration: ProductConfigurationV2;
  disablePublicOrdering?: boolean;
  requiredCapabilityKey?: FeatureKey;
  /** Only for a row initialized inside the caller's current transaction. Never exposed in a DTO. */
  newProduct?: boolean;
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

/** Historical sample/backfill tools remain fail-closed; real writes use Unified Editor CAS. */
export async function persistProductConfiguration(prisma: PrismaClient, input: Omit<PersistProductConfigurationInput, "configuration"> & { configuration: ProductConfigurationV1 }) {
  throw new ProductConfigurationValidationError(rejectRetiredConfiguration(input.configuration));
}

/** Caller owns the Serializable transaction, product edit CAS and retry policy. */
export async function persistProductConfigurationInTransaction(
  transaction: Prisma.TransactionClient,
  input: PersistProductConfigurationInput
) {
  if (input.configuration.productId !== input.productId) {
    throw new ProductConfigurationConflictError("Configuration productId does not match the target product");
  }
  if (input.configuration.revision !== input.expectedVersion + 1) {
    throw new ProductConfigurationConflictError("Configuration revision must equal expectedVersion + 1");
  }

  const issues = validateConfiguration(input.configuration);
  if (issues.length) throw new ProductConfigurationValidationError(issues);

  const configurationTree = JSON.parse(JSON.stringify(input.configuration)) as Prisma.InputJsonValue;
  const edges = collectDependencyEdges(input.configuration);
  const uniqueSourceIds = [...new Set(edges.map((edge) => edge.sourceProductId))];


    const restaurant = await transaction.restaurant.findUnique({
      where: { id: input.restaurantId }, select: { currency: true }
    });
    if (!restaurant) throw new ProductConfigurationConflictError("Restaurant was not found");
    const currencyIssues = validateConfigurationCurrency(input.configuration, restaurant.currency);
    if (currencyIssues.length) throw new ProductConfigurationValidationError(currencyIssues);
    if (input.requiredCapabilityKey) {
      const subscription = await transaction.restaurantSubscription.findUnique({
        where: { restaurantId: input.restaurantId },
        include: {
          plan: {
            include: {
              features: {
                where: { key: input.requiredCapabilityKey }
              }
            }
          }
        }
      });
      if (!subscription?.plan.features[0]?.enabled) {
        throw new ProductConfigurationCapabilityError(
          "Product Configuration capability is no longer assigned to this restaurant"
        );
      }
    }

    const owner = await transaction.product.findFirst({
      where: {
        id: input.productId,
        restaurantId: input.restaurantId,
        deletedAt: null
      },
      select: { configurationVersion: true }
    });
    if (!owner) throw new ProductConfigurationConflictError("Product was not found in the requested restaurant");
    if (owner.configurationVersion !== input.expectedVersion + (input.newProduct ? 1 : 0)) {
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
        select: { id: true, configurationTree: true, configurationVersion: true }
      });
      const found = new Set(sources.map((source) => source.id));
      const missing = uniqueSourceIds.filter((sourceId) => !found.has(sourceId));
      if (missing.length) {
        throw new ProductConfigurationConflictError(
          `Linked products are missing or outside the restaurant: ${missing.join(", ")}`
        );
      }

      const originalSourceIds = new Set(
        edges.filter((edge) => edge.mode === "ORIGINAL").map((edge) => edge.sourceProductId)
      );
      const unconfiguredOriginalSources = sources
        .filter((source) => originalSourceIds.has(source.id))
        .filter((source) => source.configurationTree === null || source.configurationVersion < 1)
        .map((source) => source.id);
      if (unconfiguredOriginalSources.length) {
        throw new ProductConfigurationConflictError(
          `ORIGINAL linked products require a saved network configuration: ${unconfiguredOriginalSources.join(", ")}`,
          "ORIGINAL_LINKED_SOURCE_REQUIRES_NETWORK_CONFIGURATION",
          {
            sourceProductIds: unconfiguredOriginalSources,
            allowedWithoutSourceConversion: ["CUSTOM"],
            requiresExplicitSourceConfigurationForOriginal: true
          }
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

    // Check both the edited product and its consumers under the same serializable snapshot.
    const graph = [...existingEdges, ...edges];
    if (graph.some(edge => edge.productId === input.productId || edge.sourceProductId === input.productId)) {
      const affected = new Set([input.productId]);
      const consumers = new Map<string, string[]>();
      const dependencies = new Map<string, string[]>();
      for (const edge of graph) {
        const parents = consumers.get(edge.sourceProductId) ?? [];
        parents.push(edge.productId);
        consumers.set(edge.sourceProductId, parents);
        const targets = dependencies.get(edge.productId) ?? [];
        targets.push(edge.sourceProductId);
        dependencies.set(edge.productId, targets);
      }
      for (const id of affected) for (const parent of consumers.get(id) ?? []) affected.add(parent);
      const needed = new Set(affected);
      for (const id of needed) for (const child of dependencies.get(id) ?? []) needed.add(child);
      const rows = await transaction.product.findMany({
        where: { restaurantId: input.restaurantId, id: { in: [...needed] }, deletedAt: null },
        select: { id: true, configurationTree: true }
      });
      const trees = new Map(rows.map(item => [item.id, item.configurationTree as unknown as ProductConfigurationV2 | null]));
      trees.set(input.productId, input.configuration);
      const linkedProducts = new Map(rows.map(item => [item.id, {
        productId: item.id, catalogId: input.restaurantId,
        // CUSTOM may link an ordinary product; its explicit local tree supplies structure.
        configuration: trees.get(item.id) ?? { schemaVersion: 2 as const, productId: item.id, revision: 1, basePrice: "0", groups: [] }
      }]));
      for (const id of affected) {
        const tree = trees.get(id);
        if (!tree) continue;
        const issues = validateGroupLevels(tree, sourceId => trees.get(sourceId) ?? undefined);
        if (issues.length) throw new ProductConfigurationValidationError(issues);
        const resolved = resolveConfigurationContextV2(tree, { catalogId: input.restaurantId, currency: restaurant.currency, linkedProducts });
        if (resolved.issues.length) throw new ProductConfigurationValidationError(resolved.issues);
      }
    }

    const updated = await transaction.product.updateMany({
      where: {
        id: input.productId,
        restaurantId: input.restaurantId,
        configurationVersion: input.expectedVersion + (input.newProduct ? 1 : 0),
        deletedAt: null
      },
      data: {
        basePrice:
          input.configuration.basePrice === null
            ? null
            : new Prisma.Decimal(input.configuration.basePrice),
        configurationTree,
        configurationVersion: input.configuration.revision,
        ...(input.disablePublicOrdering ? { isAvailable: false } : {})
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

}
