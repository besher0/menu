import { ProductConfigurationV2, validateConfigurationV2 as validateConfiguration } from "@menu/shared";

/** A real, persisted V2 tree with no price source; Shared pricing rejects a sale. */
export function initialNetworkSetupConfiguration(productId: string): ProductConfigurationV2 {
  const configuration: ProductConfigurationV2 = {
    schemaVersion: 2,
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
  const configuration = value as Partial<ProductConfigurationV2>;
  return configuration.schemaVersion === 2
    && configuration.basePrice === null
    && Array.isArray(configuration.groups)
    && configuration.groups.length === 0;
}
