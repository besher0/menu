export const PRODUCT_CONFIGURATION_SCHEMA_VERSION = 1 as const;
export const PRODUCT_SELECTION_SCHEMA_VERSION = 1 as const;
export const PRODUCT_CONFIGURATION_SNAPSHOT_VERSION = 1 as const;

/** Canonical, non-negative decimal text. Scientific notation is intentionally forbidden. */
export type MoneyString = string;

export type LinkedProductMode = "ORIGINAL" | "CUSTOM";

export type ConfigurationIssue = {
  code: string;
  path: string;
  message: string;
};

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

export type SizePriceOverride = {
  sizeChoiceId: string;
  /** null is an explicit blank override and falls back to the option's default price. */
  price: MoneyString | null;
};

export type LinkedProductDefinition = {
  sourceProductId: string;
  mode: LinkedProductMode;
  /** Required only in CUSTOM mode. Structure and prices are a local snapshot. */
  customConfiguration?: ProductConfigurationV1;
  /**
   * ORIGINAL mode never inherits standalone source selling prices. Price-bearing source
   * node IDs not present here resolve to zero inside the parent context.
   */
  originalPriceOverrides?: Readonly<Record<string, MoneyString>>;
};

export type SizeChoice = {
  id: string;
  label: string;
  /** Full selling price contribution, never a delta from Base. */
  price: MoneyString;
  calories?: string | null;
  available?: boolean;
  children?: ConfigurationGroup[];
};

export type SizeGroup = {
  type: "SIZE";
  id: string;
  label: string;
  available?: boolean;
  sizes: SizeChoice[];
};

export type OptionChoice = {
  id: string;
  label: string;
  /** Local price per selected unit. For linked products this is the parent-context price. */
  price: MoneyString;
  minQuantity?: number;
  maxQuantity: number;
  available?: boolean;
  priceOverrides?: SizePriceOverride[];
  children?: ConfigurationGroup[];
  linkedProduct?: LinkedProductDefinition;
};

export type OptionGroup = {
  type: "OPTIONS";
  id: string;
  label: string;
  available?: boolean;
  /** Counts selected units, not distinct option IDs. */
  min: number;
  /** null means no merchant max; the platform safety cap still applies. */
  max: number | null;
  /** Highest-priced N parent units are free. Child branch prices remain payable. */
  includedQuantity: number;
  options: OptionChoice[];
};

export type ConfigurationGroup = SizeGroup | OptionGroup;

export type ProductConfigurationV1 = {
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
  linkedSelection?: ProductSelectionV1;
};

export type OptionGroupSelection = {
  type: "OPTIONS";
  groupId: string;
  instances: OptionSelectionInstance[];
};

export type GroupSelection = SizeGroupSelection | OptionGroupSelection;

export type ProductSelectionV1 = {
  schemaVersion: typeof PRODUCT_SELECTION_SCHEMA_VERSION;
  productId: string;
  configurationRevision: number;
  groups: GroupSelection[];
};

export type LinkedProductCatalogEntry = {
  productId: string;
  catalogId: string;
  configuration: ProductConfigurationV1;
  available?: boolean;
  orderable?: boolean;
};

export type ProductConfigurationContext = {
  catalogId: string;
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
  configuration: ProductConfigurationV1;
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
  selection: ProductSelectionV1;
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
