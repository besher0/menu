const zones: Record<string, string> = {
  sy: "Asia/Damascus", syria: "Asia/Damascus", "سوريا": "Asia/Damascus", "سورية": "Asia/Damascus",
  de: "Europe/Berlin", germany: "Europe/Berlin", "ألمانيا": "Europe/Berlin",
  tr: "Europe/Istanbul", turkey: "Europe/Istanbul", "تركيا": "Europe/Istanbul",
  sa: "Asia/Riyadh", "السعودية": "Asia/Riyadh", ae: "Asia/Dubai", "الإمارات": "Asia/Dubai",
  lb: "Asia/Beirut", "لبنان": "Asia/Beirut", jo: "Asia/Amman", "الأردن": "Asia/Amman"
};
const currencyZones: Record<string, string> = {
  SYP: "Asia/Damascus", "ل.س": "Asia/Damascus", SAR: "Asia/Riyadh", AED: "Asia/Dubai",
  TRY: "Europe/Istanbul", JOD: "Asia/Amman", LBP: "Asia/Beirut"
};
export function marketTimeZone(country: string | null, currency: string) {
  const key = country?.trim().toLowerCase();
  return key ? zones[key] ?? "UTC" : currencyZones[currency.trim().toUpperCase()] ?? "UTC";
}
