export function formatWhatsappOrderTime(at: Date, timeZone: string, locale: "ar" | "en") {
  const parts = new Intl.DateTimeFormat(locale === "ar" ? "ar-SY" : "en-US", {
    timeZone, calendar: "gregory", numberingSystem: "latn", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value("year")}/${value("month")}/${value("day")}${locale === "ar" ? "،" : ","} ${value("hour")}:${value("minute")} ${value("dayPeriod")}`;
}
