import { expect, it } from "vitest";
import { marketTimeZone } from "../../common/market-time-zone";
import { formatWhatsappOrderTime } from "./whatsapp-order-time";

it("formats the confirmed instant in the restaurant market with Gregorian Latin digits", () => {
  const zone = marketTimeZone(null, "ل.س");
  expect(formatWhatsappOrderTime(new Date("2026-11-22T09:45:00Z"), zone, "ar")).toBe("2026/11/22، 12:45 م");
  expect(formatWhatsappOrderTime(new Date("2026-11-22T21:05:00Z"), zone, "ar")).toBe("2026/11/23، 12:05 ص");
  expect(formatWhatsappOrderTime(new Date("2026-11-22T09:45:00Z"), marketTimeZone("DE", "EUR"), "en")).toBe("2026/11/22, 10:45 AM");
});
