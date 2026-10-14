import { ProductConfigurationV1, validateConfiguration } from "@menu/shared";

/** A real, persisted V1 tree with no price source; Shared pricing rejects a sale. */
export function initialNetworkSetupConfiguration(productId: string): ProductConfigurationV1 {
  const configuration: ProductConfigurationV1 = {
    schemaVersion: 1,
    productId,
    revision: 1,
    basePrice: null,
    groups: []
  };
  const issues = validateConfiguration(configuration);
  if (issues.length) throw new Error("The Network setup configuration no longer satisfies the shared contract");
  return configuration;
}

export function isUnpricedNetworkSetup(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const configuration = value as Partial<ProductConfigurationV1>;
  return configuration.schemaVersion === 1
    && configuration.basePrice === null
    && Array.isArray(configuration.groups)
    && configuration.groups.length === 0;
}
