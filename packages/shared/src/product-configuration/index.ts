export * from "./types";
export * from "./money";
export * from "./integration-boundary";
export { resolveEngineLimits } from "./validation";
export type {
  ProductConfigurationV2, ProductSelectionV2, SizePricing, LocalPrice,
  ConfigurationGroup as ConfigurationGroupV2, SizeGroup as SizeGroupV2,
  OptionGroup as OptionGroupV2, OptionChoice as OptionChoiceV2, SizeChoice as SizeChoiceV2,
  GroupSelection as GroupSelectionV2, LinkedProductDefinition as LinkedProductDefinitionV2,
  ProductConfigurationContext as ProductConfigurationContextV2,
  ConfigurationSnapshot as ConfigurationSnapshotV2, SnapshotResult as SnapshotResultV2,
  ProductConfigurationRecord as ProductConfigurationRecordV2
} from "./v2-types";
export {
  PRODUCT_CONFIGURATION_SCHEMA_VERSION as PRODUCT_CONFIGURATION_V2_SCHEMA_VERSION,
  PRODUCT_SELECTION_SCHEMA_VERSION as PRODUCT_SELECTION_V2_SCHEMA_VERSION,
  PRODUCT_CONFIGURATION_SNAPSHOT_VERSION as PRODUCT_CONFIGURATION_V2_SNAPSHOT_VERSION
} from "./v2-types";
export { validateConfiguration as validateConfigurationV2, validateGroupLevels as validateGroupLevelsV2 } from "./validation";
export { collectDependencyEdges as collectDependencyEdgesV2, validateDependencyGraph as validateDependencyGraphV2 } from "./dependencies";
export { resolveLinkedConfiguration as resolveLinkedConfigurationV2, resolveConfigurationContext as resolveConfigurationContextV2 } from "./resolution";
export { validateSelection as validateSelectionV2 } from "./selection";
export { calculatePrice as calculatePriceV2 } from "./pricing";
export { calculateMinimumPrice as calculateMinimumPriceV2 } from "./minimum-price";
export { createConfigurationSnapshot as createConfigurationSnapshotV2, createSelectionKey as createSelectionKeyV2 } from "./snapshot";
export { eligibleSizeGroups, resolveSizePricingScope } from "./scope";
export { configurationContainsSize as configurationContainsSizeV2 } from "./validation";
export { validateConfigurationCurrencyV2, cloneCustomConfigurationV2, completeAnonymousSelectionV2 } from "./v2-helpers";

// Active V2 customer contracts. Deprecated V1 exports above are rejection-only guards.
export type { OptionGroupSelection as OptionGroupSelectionV2, OptionSelectionInstance as OptionSelectionInstanceV2,
  SizeGroupSelection as SizeGroupSelectionV2, LinkedProductCatalogEntry as LinkedProductCatalogEntryV2,
  PriceResult as PriceResultV2, PriceLine as PriceLineV2, MinimumPriceResult as MinimumPriceResultV2 } from "./v2-types";
export { effectiveOptionPrice as effectiveOptionPriceV2 } from "./scope";
export { parseProductSelectionV2 } from "./v2-selection-payload";
