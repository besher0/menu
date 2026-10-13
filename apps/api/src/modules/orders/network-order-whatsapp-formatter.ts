import { compareMoney, multiplyMoney, normalizeMoney, sumMoney, validateMoneyString, DEFAULT_ENGINE_LIMITS } from "@menu/shared";
import type {
  ConfigurationGroup, GroupSelection, OptionChoice, OptionSelectionInstance,
  PriceLine, ProductConfigurationV1, ProductSelectionV1
} from "@menu/shared";

type Locale = "ar" | "en";
type JsonObject = Record<string, unknown>;

export class NetworkOrderSnapshotFormatError extends Error {
  constructor(public readonly code: string, public readonly path: string, detail: string) {
    super(`${code} at ${path}: ${detail}`);
    this.name = "NetworkOrderSnapshotFormatError";
  }
}

function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_OBJECT", path, "Expected an object.");
  }
  return value as JsonObject;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_ARRAY", path, "Expected an array.");
  return value;
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new NetworkOrderSnapshotFormatError("MISSING_SNAPSHOT_TEXT", path, "Historical display text is missing.");
  }
  return value;
}

function money(value: unknown, path: string): string {
  const issues = validateMoneyString(value, path, DEFAULT_ENGINE_LIMITS);
  if (issues.length) throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_MONEY", path, issues[0].message);
  return normalizeMoney(value as string);
}

function quantity(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_QUANTITY", path, "Quantity must be 1–100.");
  }
  return value as number;
}

/** Keep historical text legible, but never let a name add a forged line or WhatsApp formatting. */
function display(value: string, path: string, maxLength = 200): string {
  const cleaned = value
    .replace(/[\r\n\u2028\u2029\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\*/g, "＊").replace(/_/g, "＿").replace(/~/g, "～").replace(/`/g, "ˋ")
    .replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_DISPLAY_TEXT", path, "Display text is empty or too long; it was not truncated.");
  }
  return `\u2068${cleaned}\u2069`;
}

const words = {
  ar: { title: "🧾 طلب OrderSawa — معاينة", size: "الحجم", required: "مطلوب", optional: "اختياري",
    linked: "صنف داخل المجموعة", included: "مشمول", free: "مجاني",
    unit: "سعر الوحدة", each: "للوحدة", line: "إجمالي الصنف", total: "إجمالي الطلب", base: "السعر الأساسي",
    restaurant: "المطعم", customer: "اسم الزبون", phone: "هاتف الزبون", fulfillment: "طريقة الاستلام",
    pickup: "استلام من المطعم", delivery: "توصيل", area: "المنطقة", near: "بالقرب من", beside: "بجانب",
    pickupTime: "موعد الاستلام", orderNote: "ملاحظات الطلب", itemNote: "ملاحظة الصنف" },
  en: { title: "🧾 OrderSawa order — preview", size: "Size", required: "required", optional: "optional",
    linked: "Combo item", included: "included", free: "free",
    unit: "Unit price", each: "each", line: "Line total", total: "Order total", base: "Base price",
    restaurant: "Restaurant", customer: "Customer", phone: "Customer phone", fulfillment: "Fulfillment",
    pickup: "Pickup", delivery: "Delivery", area: "Area", near: "Near", beside: "Beside",
    pickupTime: "Pickup time", orderNote: "Order note", itemNote: "Item note" }
} as const;

type StoredSource = { productId: string; productName: string; mode: "NETWORK" | "LEGACY"; configurationTree: ProductConfigurationV1 };

class LineRenderer {
  readonly rendered: string[] = [];
  private readonly usedLines = new Set<number>();
  private readonly sourceOccurrences = new Map<string, number>();

  constructor(
    private readonly locale: Locale,
    private readonly currency: string,
    private readonly priceLines: PriceLine[],
    private readonly sources: StoredSource[]
  ) {}

  private price(path: string, kind: PriceLine["kind"], nodeId: string, sourceProductId?: string): PriceLine {
    const matches = this.priceLines.map((line, index) => ({ line, index })).filter(({ line }) =>
      line.path === path && line.kind === kind && line.nodeId === nodeId);
    if (matches.length !== 1 || this.usedLines.has(matches[0].index)) {
      throw new NetworkOrderSnapshotFormatError("MISSING_OR_DUPLICATE_PRICE_LINE", path, "Expected one historical price line.");
    }
    const { line, index } = matches[0];
    money(line.amount, `${path}.amount`);
    money(line.chargedAmount, `${path}.chargedAmount`);
    if (line.included && compareMoney(line.chargedAmount, "0") !== 0) {
      throw new NetworkOrderSnapshotFormatError("INVALID_INCLUDED_PRICE_LINE", path, "Included units must have zero charged amount.");
    }
    if (!line.included && compareMoney(line.amount, line.chargedAmount) !== 0) {
      throw new NetworkOrderSnapshotFormatError("PRICE_LINE_AMOUNT_MISMATCH", path, "Non-included amount differs from its saved charge.");
    }
    if (kind === "OPTION" && line.sourceProductId !== sourceProductId) {
      throw new NetworkOrderSnapshotFormatError("LINKED_SOURCE_PRICE_MISMATCH", path, "Linked source identity differs from the price line.");
    }
    this.usedLines.add(index);
    return line;
  }

  private priceSuffix(line: PriceLine): string {
    const w = words[this.locale];
    if (line.included) return w.included;
    if (compareMoney(line.chargedAmount, "0") === 0) return w.free;
    return `${line.chargedAmount} ${this.currency} ${w.each}`;
  }

  render(configuration: ProductConfigurationV1, selection: ProductSelectionV1) {
    if (configuration.productId !== selection.productId || configuration.revision !== selection.configurationRevision) {
      throw new NetworkOrderSnapshotFormatError("SNAPSHOT_REVISION_MISMATCH", "$selection", "Configuration and selection differ.");
    }
    const base = this.priceLines.find((line) => line.kind === "BASE");
    if (base) {
      const entry = this.price("$configuration.basePrice", "BASE", configuration.productId);
      this.rendered.push(`${words[this.locale].base}: ${this.priceSuffix(entry)}`);
    }
    this.groups(configuration.groups, selection.groups, "$selection.groups", 0);
    if (this.usedLines.size !== this.priceLines.length) {
      throw new NetworkOrderSnapshotFormatError("UNUSED_PRICE_LINE", "$priceBreakdown", "Historical price lines do not match selected nodes.");
    }
    return this.rendered;
  }

  private groups(groupsValue: unknown, selectionsValue: unknown, prefix: string, depth: number) {
    if (depth > 24) throw new NetworkOrderSnapshotFormatError("SNAPSHOT_DEPTH_LIMIT", prefix, "Nested selection is too deep.");
    const groups = array(groupsValue, `${prefix}.configuration`) as ConfigurationGroup[];
    const selections = array(selectionsValue, prefix) as GroupSelection[];
    const chosen = new Map<string, GroupSelection>();
    for (const selection of selections) {
      const node = object(selection, prefix);
      const id = nonempty(node.groupId, `${prefix}.groupId`);
      if (chosen.has(id) || !groups.some((group) => group.id === id)) {
        throw new NetworkOrderSnapshotFormatError("UNKNOWN_OR_DUPLICATE_GROUP", prefix, id);
      }
      chosen.set(id, selection);
    }
    for (const group of groups) {
      const groupNode = object(group, `${prefix}.configuration`);
      const groupId = nonempty(groupNode.id, `${prefix}.groupId`);
      const groupLabel = display(nonempty(groupNode.label, `${prefix}.${groupId}.label`), `${prefix}.${groupId}.label`);
      const groupSelection = chosen.get(groupId);
      const groupPath = `${prefix}.${groupId}`;
      const pad = "  ".repeat(depth);
      if (groupNode.type === "SIZE") {
        if (!groupSelection || groupSelection.type !== "SIZE") {
          throw new NetworkOrderSnapshotFormatError("MISSING_SIZE_SELECTION", groupPath, "Selected size is absent.");
        }
        const sizes = array(groupNode.sizes, `${groupPath}.sizes`) as Array<{ id: string; label: string; children?: ConfigurationGroup[] }>;
        const size = sizes.find((entry) => entry.id === groupSelection.sizeChoiceId);
        if (!size) throw new NetworkOrderSnapshotFormatError("UNKNOWN_SIZE", groupPath, "Selected size has no historical label.");
        const entry = this.price(groupPath, "SIZE", size.id);
        const sizeLabel = display(nonempty(size.label, `${groupPath}.${size.id}.label`), `${groupPath}.${size.id}.label`);
        this.rendered.push(`${pad}📏 ${groupLabel} — ${words[this.locale].size}: ${sizeLabel} (${this.priceSuffix(entry)})`);
        this.groups(size.children ?? [], groupSelection.children ?? [], `${groupPath}.${size.id}`, depth + 1);
      } else if (groupNode.type === "OPTIONS") {
        if (groupSelection && groupSelection.type !== "OPTIONS") {
          throw new NetworkOrderSnapshotFormatError("GROUP_TYPE_MISMATCH", groupPath, "Selection type differs from historical group.");
        }
        const options = array(groupNode.options, `${groupPath}.options`) as OptionChoice[];
        const instances = groupSelection?.instances ?? [];
        array(instances, `${groupPath}.instances`);
        if (!Number.isSafeInteger(groupNode.min) || Number(groupNode.min) < 0
          || (groupNode.max !== null && (!Number.isSafeInteger(groupNode.max) || Number(groupNode.max) < Number(groupNode.min)))
          || instances.length < Number(groupNode.min) || instances.length > 100
          || (groupNode.max !== null && instances.length > Number(groupNode.max))) {
          throw new NetworkOrderSnapshotFormatError("INVALID_GROUP_QUANTITY", groupPath, "Historical group bounds and selected quantity differ.");
        }
        if (!instances.length) {
          if (typeof groupNode.min !== "number" || groupNode.min > 0) {
            throw new NetworkOrderSnapshotFormatError("MISSING_REQUIRED_GROUP", groupPath, "Required historical choices are missing.");
          }
          continue;
        }
        const requirement = groupNode.min && Number(groupNode.min) > 0 ? words[this.locale].required : words[this.locale].optional;
        this.rendered.push(`${pad}➕ ${groupLabel} (${requirement}):`);
        const instanceIds = new Set<string>();
        const optionCounts = new Map<string, number>();
        const leafUnits = new Map<string, { label: string; suffix: string; count: number }>();
        const flushLeafUnits = () => {
          for (const unit of leafUnits.values()) this.rendered.push(`${pad}  • ${unit.label} × ${unit.count} — ${unit.suffix}`);
          leafUnits.clear();
        };
        for (const [index, instance] of instances.entries()) {
          const record = object(instance, `${groupPath}.instances[${index}]`) as OptionSelectionInstance;
          const instanceId = nonempty(record.instanceId, `${groupPath}.instances[${index}].instanceId`);
          if (instanceIds.has(instanceId)) throw new NetworkOrderSnapshotFormatError("DUPLICATE_INSTANCE", groupPath, instanceId);
          instanceIds.add(instanceId);
          const option = options.find((candidate) => candidate.id === record.optionId);
          if (!option) throw new NetworkOrderSnapshotFormatError("UNKNOWN_OPTION", groupPath, "Selected option has no historical label.");
          const optionCount = (optionCounts.get(option.id) ?? 0) + 1;
          optionCounts.set(option.id, optionCount);
          if (!Number.isSafeInteger(option.maxQuantity) || optionCount > option.maxQuantity) {
            throw new NetworkOrderSnapshotFormatError("INVALID_OPTION_QUANTITY", groupPath, "Selected option exceeds its historical quantity bound.");
          }
          const instancePath = `${groupPath}.${instanceId}`;
          const entry = this.price(instancePath, "OPTION", option.id, option.linkedProduct?.sourceProductId);
          const label = display(nonempty(option.label, `${instancePath}.label`), `${instancePath}.label`);
          const suffix = this.priceSuffix(entry);
          const hasBranches = Boolean((record.children?.length ?? 0) || option.linkedProduct);
          if (!hasBranches) {
            const key = `${option.id}\u0000${entry.included}\u0000${entry.chargedAmount}\u0000${entry.amount}`;
            const prior = leafUnits.get(key);
            if (prior) prior.count += 1;
            else leafUnits.set(key, { label, suffix, count: 1 });
            continue;
          }
          flushLeafUnits();
          this.rendered.push(`${pad}  • ${label} × 1 — ${suffix}`);
          this.groups(option.children ?? [], record.children ?? [], `${instancePath}.children`, depth + 2);
          if (option.linkedProduct) {
            const sourceId = option.linkedProduct.sourceProductId;
            const source = this.sources.find((candidate) => candidate.productId === sourceId);
            if (!source || !record.linkedSelection || record.linkedSelection.productId !== sourceId) {
              throw new NetworkOrderSnapshotFormatError("MISSING_LINKED_SOURCE_SNAPSHOT", instancePath, "Historical linked source or selection is absent.");
            }
            const mode = option.linkedProduct.mode;
            const linkedConfiguration = mode === "CUSTOM" ? option.linkedProduct.customConfiguration : source.configurationTree;
            if (!linkedConfiguration || (mode !== "ORIGINAL" && mode !== "CUSTOM")) {
              throw new NetworkOrderSnapshotFormatError("MISSING_LINKED_CONFIGURATION", instancePath, "Historical linked configuration is absent.");
            }
            if (linkedConfiguration.productId !== sourceId
              || linkedConfiguration.revision !== record.linkedSelection.configurationRevision
              || (mode === "ORIGINAL" && source.mode !== "NETWORK")) {
              throw new NetworkOrderSnapshotFormatError("LINKED_SNAPSHOT_IDENTITY_MISMATCH", instancePath, "Linked snapshot identity or revision differs.");
            }
            const count = (this.sourceOccurrences.get(sourceId) ?? 0) + 1;
            this.sourceOccurrences.set(sourceId, count);
            const linkedName = display(nonempty(source.productName, `${instancePath}.linkedName`), `${instancePath}.linkedName`);
            this.rendered.push(`${pad}    ↳ ${words[this.locale].linked} ${count}: ${linkedName}`);
            this.groups(linkedConfiguration.groups, record.linkedSelection.groups, `${instancePath}.linked`, depth + 3);
          } else if (record.linkedSelection) {
            throw new NetworkOrderSnapshotFormatError("UNEXPECTED_LINKED_SELECTION", instancePath, "Non-linked option has a linked selection.");
          }
        }
        flushLeafUnits();
      } else {
        throw new NetworkOrderSnapshotFormatError("UNKNOWN_GROUP_TYPE", groupPath, "Unsupported historical group type.");
      }
    }
  }
}

function optionalSnapshotText(details: JsonObject, key: string, path: string, maxLength = 200): string | undefined {
  const value = details[key];
  if (value === undefined || value === null) return undefined;
  return display(nonempty(value, `${path}.${key}`), `${path}.${key}`, maxLength);
}

function renderOrderDetails(value: unknown, locale: Locale): { header: string[]; footer: string[] } {
  if (value === undefined) return { header: [], footer: [] }; // Stage 6C snapshots predate these fields.
  const path = "$snapshot.orderDetails";
  const details = object(value, path);
  const w = words[locale];
  const header: string[] = [];
  const footer: string[] = [];
  if (details.restaurantName === undefined) {
    throw new NetworkOrderSnapshotFormatError("MISSING_SNAPSHOT_TEXT", `${path}.restaurantName`, "Historical restaurant name is missing.");
  }
  const fields = [
    ["restaurantName", w.restaurant], ["customerName", w.customer], ["customerPhone", w.phone]
  ] as const;
  for (const [key, label] of fields) {
    const value = optionalSnapshotText(details, key, path);
    if (value) header.push(`${label}: ${value}`);
  }
  const fulfillment = details.fulfillmentType;
  if (fulfillment !== undefined) {
    if (fulfillment !== "pickup" && fulfillment !== "delivery") {
      throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_FULFILLMENT", `${path}.fulfillmentType`, "Expected pickup or delivery.");
    }
    header.push(`${w.fulfillment}: ${fulfillment === "pickup" ? w.pickup : w.delivery}`);
  }
  const addressFields = [
    ["deliveryArea", w.area], ["deliveryNear", w.near], ["deliveryBeside", w.beside]
  ] as const;
  for (const [key, label] of addressFields) {
    const value = optionalSnapshotText(details, key, path);
    if (value) header.push(`${label}: ${value}`);
  }
  const pickupTime = optionalSnapshotText(details, "pickupTime", path);
  if (fulfillment === "delivery" && (!details.deliveryArea || !details.deliveryNear || !details.deliveryBeside || pickupTime)) {
    throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_FULFILLMENT", path, "Saved delivery address is incomplete.");
  }
  if (fulfillment !== "delivery" && (details.deliveryArea || details.deliveryNear || details.deliveryBeside)) {
    throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_FULFILLMENT", path, "Saved address has no delivery mode.");
  }
  if (fulfillment !== "pickup" && pickupTime) {
    throw new NetworkOrderSnapshotFormatError("INVALID_SNAPSHOT_FULFILLMENT", path, "Saved pickup time has no pickup mode.");
  }
  if (pickupTime) header.push(`${w.pickupTime}: ${pickupTime}`);
  const orderNote = optionalSnapshotText(details, "orderNote", path, 500);
  if (orderNote) footer.push(`${w.orderNote}: ${orderNote}`);
  return { header, footer };
}

export function formatNetworkOrderWhatsappMessage(snapshotValue: unknown): string {
  const snapshot = object(snapshotValue, "$snapshot");
  if (snapshot.snapshotVersion !== 1 || snapshot.mode !== "NETWORK" || (snapshot.locale !== "ar" && snapshot.locale !== "en")) {
    throw new NetworkOrderSnapshotFormatError("UNSUPPORTED_ORDER_SNAPSHOT", "$snapshot", "Expected a Stage 6C Network snapshot.");
  }
  const locale = snapshot.locale;
  const w = words[locale];
  const currency = nonempty(snapshot.currency, "$snapshot.currency");
  if (!/^[A-Z]{3}$/.test(currency)) throw new NetworkOrderSnapshotFormatError("INVALID_CURRENCY", "$snapshot.currency", "Expected ISO-style currency code.");
  const total = money(snapshot.totalAmount, "$snapshot.totalAmount");
  const items = array(snapshot.items, "$snapshot.items");
  if (!items.length || items.length > 50) throw new NetworkOrderSnapshotFormatError("INVALID_ITEM_COUNT", "$snapshot.items", "Expected 1–50 items.");
  const details = renderOrderDetails(snapshot.orderDetails, locale);
  const output = [w.title, ...details.header, ""];
  const lineTotals: string[] = [];
  for (const [index, rawItem] of items.entries()) {
    const path = `$snapshot.items[${index}]`;
    const item = object(rawItem, path);
    if (item.snapshotVersion !== 1 || item.mode !== "NETWORK" || item.locale !== locale || item.currency !== currency) {
      throw new NetworkOrderSnapshotFormatError("ITEM_SNAPSHOT_MISMATCH", path, "Line envelope differs from order snapshot.");
    }
    const productId = nonempty(item.productId, `${path}.productId`);
    const name = display(nonempty(item.productName, `${path}.productName`), `${path}.productName`);
    const count = quantity(item.quantity, `${path}.quantity`);
    const unitPrice = money(item.unitPrice, `${path}.unitPrice`);
    const lineTotal = money(item.lineTotal, `${path}.lineTotal`);
    if (compareMoney(multiplyMoney(unitPrice, count), lineTotal) !== 0) {
      throw new NetworkOrderSnapshotFormatError("LINE_TOTAL_MISMATCH", `${path}.lineTotal`, "Saved line amount and quantity differ.");
    }
    const configuration = object(item.configurationTree, `${path}.configurationTree`) as ProductConfigurationV1;
    const selection = object(item.canonicalSelection, `${path}.canonicalSelection`) as ProductSelectionV1;
    if (configuration.productId !== productId || selection.productId !== productId || item.configurationRevision !== configuration.revision) {
      throw new NetworkOrderSnapshotFormatError("PRODUCT_SNAPSHOT_MISMATCH", path, "Historical product identity or revision differs.");
    }
    const priceLines = array(item.priceBreakdown, `${path}.priceBreakdown`).map((entry, lineIndex) =>
      object(entry, `${path}.priceBreakdown[${lineIndex}]`) as PriceLine);
    const sources = array(item.linkedSources, `${path}.linkedSources`).map((entry, sourceIndex) =>
      object(entry, `${path}.linkedSources[${sourceIndex}]`) as StoredSource);
    const renderer = new LineRenderer(locale, currency, priceLines, sources);
    output.push(`${index + 1}. ${name} × ${count}`);
    output.push(...renderer.render(configuration, selection));
    if (item.note !== undefined) {
      output.push(`${w.itemNote}: ${display(nonempty(item.note, `${path}.note`), `${path}.note`, 500)}`);
    }
    if (compareMoney(sumMoney(priceLines.map((entry) => money(entry.chargedAmount, `${path}.priceBreakdown.chargedAmount`))), unitPrice) !== 0) {
      throw new NetworkOrderSnapshotFormatError("UNIT_BREAKDOWN_MISMATCH", `${path}.priceBreakdown`, "Saved breakdown differs from the saved unit price.");
    }
    output.push(`${w.unit}: ${unitPrice} ${currency}`);
    output.push(`${w.line}: ${lineTotal} ${currency}`);
    output.push("━━━━━━━━━━━━━━", "");
    lineTotals.push(lineTotal);
  }
  if (compareMoney(sumMoney(lineTotals), total) !== 0) {
    throw new NetworkOrderSnapshotFormatError("ORDER_TOTAL_MISMATCH", "$snapshot.totalAmount", "Saved order total differs from line totals.");
  }
  output.push(`💵 ${w.total}: ${total} ${currency}`);
  output.push(...details.footer);
  return output.join("\n");
}

/** Link construction is separate from formatting. It never contacts WhatsApp. */
export function buildNetworkWhatsappPreviewUrl(phone: string, message: string): string {
  if (!/^[1-9]\d{6,14}$/.test(phone)) {
    throw new NetworkOrderSnapshotFormatError("INVALID_PREVIEW_PHONE", "$phone", "Expected digits-only international phone.");
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  if (url.length > 8192) {
    throw new NetworkOrderSnapshotFormatError("WHATSAPP_URL_TOO_LONG", "$message", "The full message exceeds the preview URL safety cap; it was not truncated.");
  }
  return url;
}
