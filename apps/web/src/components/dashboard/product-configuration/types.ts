import type { ConfigurationIssue, ProductConfigurationV1 } from "@menu/shared";

export type ConfigurationCapability = {
  key: "PRODUCT_CONFIGURATION";
  assigned: boolean;
  canRead: boolean;
  canWrite: boolean;
};

export type ProductConfigurationEnvelope = {
  productId: string;
  mode: "LEGACY" | "NETWORK";
  configurationVersion: number;
  configurationTree: ProductConfigurationV1 | null;
  basePrice: string | null;
  isAvailable: boolean;
  capability: ConfigurationCapability;
  orderabilityState: "LEGACY" | "SETUP_INCOMPLETE" | "PUBLIC_INTEGRATION_PENDING" | "ACTION_REQUIRED_CAPABILITY";
};

export type ProductCandidate = {
  id: string;
  name: string;
  basePrice: number | null;
  currency: string;
  isAvailable: boolean;
  configurationMode: "LEGACY" | "NETWORK";
  configurationVersion: number;
  category?: { id?: string; name: string } | null;
};

export type ProductConfigurationDraft = {
  expectedVersion: number;
  configuration: ProductConfigurationV1;
  savedAt: string;
};

export type EditorNodeKind = "group" | "size" | "option";

export type EditorNodeRef = {
  kind: EditorNodeKind;
  id: string;
};

export type ConfigurationApiIssue = ConfigurationIssue & {
  translatedMessage?: string;
};

export class ProductConfigurationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly issues: ConfigurationIssue[] = [],
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ProductConfigurationApiError";
  }
}
