type Labels = { approximateWeight: string; meatType: string; breadType: string; spiceLevel: string };
type MealDetail = { label: string; value: string; icon: string; iconUrl?: string };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

export function productMealDetails(nutrition: unknown, labels: Labels): MealDetail[] {
  const fields = record(nutrition);
  const details = Array.isArray(nutrition) ? nutrition : fields.details;
  // An explicitly saved empty list supersedes scalar fields retained from Legacy.
  if (Array.isArray(details)) {
    return details.flatMap(item => {
      const row = record(item);
      const label = text(row.displayName) || text(row.label);
      const value = text(row.value);
      if (!value && !(label && row.valueType === "PRESENCE")) return [];
      return [{ label, value, icon: text(row.icon) || "utensils", iconUrl: text(row.iconUrl) }];
    });
  }

  const protein = text(fields.protein);
  return [
    { label: labels.approximateWeight, value: text(fields.weight), icon: "scale" },
    { label: labels.meatType, value: protein, icon: protein.includes("لحم") ? "beef" : "drumstick" },
    { label: labels.breadType, value: text(fields.breadType), icon: "wheat" },
    { label: labels.spiceLevel, value: text(fields.spice), icon: "flame" }
  ].filter(detail => detail.value.length > 0);
}
