// The persisted slug identifies the system category. Names are reserved only at write boundaries.
export function isReservedCategoryName(value: string | undefined): boolean {
  const normalized = (value ?? "").normalize("NFKC").replace(/[\p{Cf}\p{M}ـ]/gu, "").trim().toLowerCase();
  return normalized === "all" || normalized === "الكل";
}
