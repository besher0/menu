export const PRODUCT_CONFIGURATION_SCHEMA_VERSION = 2 as const;
export const PRODUCT_SELECTION_SCHEMA_VERSION = 2 as const;
export const PRODUCT_CONFIGURATION_SNAPSHOT_VERSION = 2 as const;

/** Canonical, non-negative decimal text. Scientific notation is intentionally forbidden. */
export type MoneyString = string;

export type LinkedProductMode = "ORIGINAL" | "CUSTOM";

export type ConfigurationIssue = {
  code: string;
  path: string;
  message: string;
};

export const MAX_GROUP_LEVELS = 3;

export type EngineLimits = {
  maxDepth: number;
  maxNodes: number;
  maxGroupChoices: number;
  maxQuantityPerGroup: number;
  maxSelectionInstances: number;
  maxMoneyIntegerDigits: number;
  maxMoneyScale: number;
  maxMinimumPriceStates: number;
};

export const DEFAULT_ENGINE_LIMITS: Readonly<EngineLimits> = Object.freeze({
  maxDepth: 12,
  maxNodes: 1_000,
  maxGroupChoices: 100,
  maxQuantityPerGroup: 100,
  maxSelectionInstances: 500,
  maxMoneyIntegerDigits: 18,
  maxMoneyScale: 6,
  maxMinimumPriceStates: 20_000
});

export type SizePricing = {
  sizeGroupId: string;
  overrides: Readonly<Record<string, MoneyString | null>>;
};
export type LocalPrice = {
  price: MoneyString;
  priceBySize?: SizePricing;
};

export type LinkedProductDefinition = {
  sourceProductId: string;
  mode: LinkedProductMode;
  /** Required only in CUSTOM mode. Structure and prices are a local snapshot. */
  customConfiguration?: ProductConfigurationV2;
  /**
   * ORIGINAL mode never inherits standalone source selling prices. Price-bearing source
   * node IDs not present here resolve to zero inside the parent context.
   */
  originalPriceOverrides?: Readonly<Record<string, LocalPrice>>;
};

export type SizeChoice = {
  id: string;
  label: string;
  /** Full selling price contribution, never a delta from Base. */
  price: MoneyString;
  available?: boolean;
};

export type SizeGroup = {
  type: "SIZE";
  id: string;
  label: string;
  /** Generated editor label; the merchant left the public heading blank. */
  hidePublicLabel?: boolean;
  highlightInPriceSummary?: boolean;
  available?: boolean;
  sizes: SizeChoice[];
  children?: ConfigurationGroup[];
};

export type OptionChoice = {
  highlightInPriceSummary?: boolean;
  id: string;
  label: string;
  /** Local price per selected unit. For linked products this is the parent-context price. */
  price: MoneyString;
  minQuantity?: number;
  maxQuantity: number | null;
  available?: boolean;
  priceBySize?: SizePricing;
  children?: ConfigurationGroup[];
  linkedProduct?: LinkedProductDefinition;
};

export type OptionGroup = {
  type: "OPTIONS";
  id: string;
  label: string;
  /** Generated editor label; the merchant left the public heading blank. */
  hidePublicLabel?: boolean;
  highlightInPriceSummary?: boolean;
  available?: boolean;
  /** Counts selected units, not distinct option IDs. */
  min: number;
  /** null means no merchant max; the platform safety cap still applies. */
  max: number | null;
  /** Highest-priced N parent units are free. Child branch prices remain payable. */
  includedQuantity: number;
  options: OptionChoice[];
  children?: ConfigurationGroup[];
};

export type ConfigurationGroup = SizeGroup | OptionGroup;

export type ProductConfigurationV2 = {
  schemaVersion: typeof PRODUCT_CONFIGURATION_SCHEMA_VERSION;
  productId: string;
  revision: number;
  /** null means no Base price. "0" is an explicit zero price. */
  basePrice: MoneyString | null;
  groups: ConfigurationGroup[];
};

export type SizeGroupSelection = {
  type: "SIZE";
  groupId: string;
  sizeChoiceId: string;
  children?: GroupSelection[];
};

export type OptionSelectionInstance = {
  /** Stable per selected unit/branch. Repeated units must not share an ID. */
  instanceId: string;
  optionId: string;
  children?: GroupSelection[];
  linkedSelection?: ProductSelectionV2;
};

export type OptionGroupSelection = {
  type: "OPTIONS";
  groupId: string;
  instances: OptionSelectionInstance[];
  children?: GroupSelection[];
};

export type GroupSelection = SizeGroupSelection | OptionGroupSelection;

export type ProductSelectionV2 = {
  schemaVersion: typeof PRODUCT_SELECTION_SCHEMA_VERSION;
  productId: string;
  configurationRevision: number;
  groups: GroupSelection[];
};

export type LinkedProductCatalogEntry = {
  productId: string;
  catalogId: string;
  configuration: ProductConfigurationV2;
  available?: boolean;
  orderable?: boolean;
};

export type ProductConfigurationContext = {
  catalogId: string;
  currency: string;
  linkedProducts?: ReadonlyMap<string, LinkedProductCatalogEntry>;
  limits?: Partial<EngineLimits>;
};

export type DependencyEdge = {
  productId: string;
  sourceProductId: string;
  optionId: string;
  path: string;
  mode: LinkedProductMode;
};

export type ProductConfigurationRecord = {
  productId: string;
  catalogId: string;
  configuration: ProductConfigurationV2;
};

export type PriceLine = {
  kind: "BASE" | "SIZE" | "OPTION";
  path: string;
  nodeId: string;
  label: string;
  instanceId?: string;
  sourceProductId?: string;
  amount: MoneyString;
  chargedAmount: MoneyString;
  included: boolean;
};

export type PriceResult = {
  valid: boolean;
  total: MoneyString | null;
  baseIgnored: boolean;
  lines: PriceLine[];
  issues: ConfigurationIssue[];
};

export type MinimumPriceResult = {
  orderable: boolean;
  minimum: MoneyString | null;
  maximumRequired: MoneyString | null;
  display: "EXACT" | "STARTING_AT" | "UNAVAILABLE";
  baseIgnored: boolean;
  issues: ConfigurationIssue[];
};

export type ConfigurationSnapshot = {
  snapshotVersion: typeof PRODUCT_CONFIGURATION_SNAPSHOT_VERSION;
  productId: string;
  productName: string;
  currency: string;
  configurationRevision: number;
  selectionKey: string;
  selection: ProductSelectionV2;
  total: MoneyString;
  baseIgnored: boolean;
  priceLines: PriceLine[];
  createdAt: string;
};

export type SnapshotResult = {
  valid: boolean;
  snapshot: ConfigurationSnapshot | null;
  issues: ConfigurationIssue[];
};
