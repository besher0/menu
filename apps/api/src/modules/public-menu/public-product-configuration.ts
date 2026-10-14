import {
  calculateMinimumPrice,
  collectDependencyEdges,
  validateConfiguration,
  type ConfigurationIssue,
  type LinkedProductCatalogEntry,
  type ProductConfigurationContext,
  type ProductConfigurationV1
} from "@menu/shared";
import { isUnpricedNetworkSetup } from "../products/network-setup-configuration";

export type PublicConfigurationProductRecord = {
  id: string;
  slug: string;
  name: string;
  basePrice: { toString(): string } | string | number | null;
  configurationTree: unknown;
  configurationVersion: number;
  isActive: boolean;
  isAvailable: boolean;
  deletedAt: Date | null;
};

export type PublicLinkedConfigurationSource = {
  productId: string;
  slug: string;
  name: string;
  mode: "NETWORK" | "LEGACY";
  available: boolean;
  orderable: boolean;
  configuration: ProductConfigurationV1;
};

export type PublicProductConfigurationResponse = {
  schemaVersion: 1;
  productId: string;
  productSlug: string;
  productName: string;
  configurationRevision: number;
  configuration: ProductConfigurationV1;
  linkedProducts: PublicLinkedConfigurationSource[];
  orderable: boolean;
  previewOnly: true;
  orderAction: "STAGE_6_REQUIRED";
  minimumPrice: string | null;
  maximumRequiredPrice: string | null;
  priceDisplay: "EXACT" | "STARTING_AT" | "UNAVAILABLE";
  issues: ConfigurationIssue[];
  runtimeContext: {
    scope: "RESTAURANT";
    outletDifferentialApplied: false;
    serviceModeApplied: false;
    productScheduleApplied: false;
  };
};

function decimalText(value: PublicConfigurationProductRecord["basePrice"]): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

function isConfiguration(value: unknown): value is ProductConfigurationV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ProductConfigurationV1>;
  return candidate.schemaVersion === 1
    && typeof candidate.productId === "string"
    && Number.isInteger(candidate.revision)
    && Array.isArray(candidate.groups);
}

function canonicalConfiguration(product: PublicConfigurationProductRecord) {
  if (
    product.configurationVersion > 0
    && isConfiguration(product.configurationTree)
    && product.configurationTree.productId === product.id
    && product.configurationTree.revision === product.configurationVersion
  ) {
    return product.configurationTree;
  }

  return null;
}

function runtimeConfiguration(product: PublicConfigurationProductRecord): ProductConfigurationV1 {
  return canonicalConfiguration(product) ?? {
    schemaVersion: 1,
    productId: product.id,
    revision: product.configurationVersion,
    basePrice: decimalText(product.basePrice),
    groups: []
  };
}

function sourceAvailable(product: PublicConfigurationProductRecord) {
  return product.deletedAt === null && product.isActive && product.isAvailable;
}

function uniqueIssues(issues: readonly ConfigurationIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}\u0000${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reachableSourceIds(
  owner: ProductConfigurationV1,
  products: ReadonlyMap<string, PublicConfigurationProductRecord>
) {
  const result = new Set<string>();
  const visitedConfigurations = new Set<string>();

  function visit(configuration: ProductConfigurationV1) {
    const key = `${configuration.productId}:${configuration.revision}`;
    if (visitedConfigurations.has(key)) return;
    visitedConfigurations.add(key);

    for (const edge of collectDependencyEdges(configuration)) {
      result.add(edge.sourceProductId);
      if (edge.mode !== "ORIGINAL") continue;
      const source = products.get(edge.sourceProductId);
      const sourceConfiguration = source ? canonicalConfiguration(source) : null;
      if (sourceConfiguration) visit(sourceConfiguration);
    }
  }

  visit(owner);
  return result;
}

export function resolvePublicProductConfiguration(args: {
  restaurantId: string;
  owner: PublicConfigurationProductRecord;
  catalogProducts: readonly PublicConfigurationProductRecord[];
  capabilityEnabled: boolean;
}): PublicProductConfigurationResponse | null {
  const ownerConfiguration = canonicalConfiguration(args.owner);
  if (!ownerConfiguration) return null;

  const products = new Map(args.catalogProducts.map((product) => [product.id, product]));
  const linkedProducts = new Map<string, LinkedProductCatalogEntry>();
  for (const product of args.catalogProducts) {
    const configuration = runtimeConfiguration(product);
    const networkConfiguration = canonicalConfiguration(product);
    const available = sourceAvailable(product);
    const structurallyValid = networkConfiguration
      ? validateConfiguration(networkConfiguration).length === 0
      : true;
    linkedProducts.set(product.id, {
      productId: product.id,
      catalogId: args.restaurantId,
      configuration,
      available,
      orderable: available && structurallyValid && !isUnpricedNetworkSetup(configuration) && args.capabilityEnabled
    });
  }

  const context: ProductConfigurationContext = {
    catalogId: args.restaurantId,
    linkedProducts
  };
  const issues: ConfigurationIssue[] = [...validateConfiguration(ownerConfiguration)];
  for (const edge of collectDependencyEdges(ownerConfiguration)) {
    const source = products.get(edge.sourceProductId);
    if (edge.mode === "ORIGINAL" && source && !canonicalConfiguration(source)) {
      issues.push({
        code: "ORIGINAL_LINKED_SOURCE_REQUIRES_NETWORK_CONFIGURATION",
        path: edge.path,
        message: "Original linked source does not have a live Network configuration."
      });
    }
  }

  const minimum = calculateMinimumPrice(ownerConfiguration, context);
  issues.push(...minimum.issues);
  if (!args.capabilityEnabled) {
    issues.push({
      code: "PRODUCT_CONFIGURATION_CAPABILITY_UNAVAILABLE",
      path: "$configuration",
      message: "Product Configuration capability is not currently available."
    });
  }
  if (!sourceAvailable(args.owner)) {
    issues.push({
      code: "PRODUCT_UNAVAILABLE",
      path: "$configuration",
      message: "Product is not currently available."
    });
  }

  const reachable = reachableSourceIds(ownerConfiguration, products);
  const publicSources = [...reachable].flatMap((productId) => {
    const product = products.get(productId);
    if (!product) return [];
    const configuration = runtimeConfiguration(product);
    const available = sourceAvailable(product);
    const mode = canonicalConfiguration(product) ? "NETWORK" as const : "LEGACY" as const;
    return [{
      productId: product.id,
      slug: product.slug,
      name: product.name,
      mode,
      available,
      orderable: available && args.capabilityEnabled && (mode === "LEGACY" || (validateConfiguration(configuration).length === 0 && !isUnpricedNetworkSetup(configuration))),
      configuration
    }];
  });

  const finalIssues = uniqueIssues(issues);
  const orderable = args.capabilityEnabled && sourceAvailable(args.owner) && minimum.orderable && finalIssues.length === 0;

  return {
    schemaVersion: 1,
    productId: args.owner.id,
    productSlug: args.owner.slug,
    productName: args.owner.name,
    configurationRevision: ownerConfiguration.revision,
    configuration: ownerConfiguration,
    linkedProducts: publicSources,
    orderable,
    previewOnly: true,
    orderAction: "STAGE_6_REQUIRED",
    minimumPrice: orderable ? minimum.minimum : null,
    maximumRequiredPrice: orderable ? minimum.maximumRequired : null,
    priceDisplay: orderable ? minimum.display : "UNAVAILABLE",
    issues: finalIssues,
    runtimeContext: {
      scope: "RESTAURANT",
      outletDifferentialApplied: false,
      serviceModeApplied: false,
      productScheduleApplied: false
    }
  };
}
