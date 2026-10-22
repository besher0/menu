import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PriceLine } from "@menu/shared";
import { networkCartChoiceLabels, networkCartHeading } from "./cart-presentation";

const line = (path: string, nodeId: string, label: string, chargedAmount: string, extra: Partial<PriceLine> = {}): PriceLine => ({
  kind: "OPTION", path, nodeId, label, amount: chargedAmount, chargedAmount, included: false, ...extra
});

describe("compact network cart choices", () => {
  it("keeps the existing Legacy cart title in its own rendering branch", () => {
    const source = readFileSync(new URL("./public-menu-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('item.mode === "NETWORK" ? networkCartHeading(item) : <>{item.quantity} × {item.name}</>');
  });

  it("shows Network size without duplicating the adjacent quantity", () => {
    const priceBreakdown: PriceLine[] = [
      { ...line("$selection.groups.size", "medium", "وسط", "110"), kind: "SIZE" },
      line("$selection.groups.toppings.a", "olive", "زيتون", "8")
    ];
    expect(networkCartHeading({ name: "بيتزا مارغريتا", acceptedQuote: { priceBreakdown } }))
      .toBe("بيتزا مارغريتا — وسط");
  });

  it("does not mistake a linked or nested size for the main item size", () => {
    const priceBreakdown: PriceLine[] = [
      { ...line("$selection.groups.combo.a.linked.size", "large", "كبير", "0"), kind: "SIZE" }
    ];
    expect(networkCartHeading({ name: "كومبو", acceptedQuote: { priceBreakdown } }))
      .toBe("كومبو");
  });

  it("groups identical leaf choices per configuration, without individual prices", () => {
    const lines: PriceLine[] = [
      { ...line("$selection.groups.size", "large", "كبير", "145"), kind: "SIZE" },
      line("$selection.groups.toppings.a", "olive", "زيتون", "8"),
      line("$selection.groups.toppings.b", "olive", "زيتون", "8"),
      line("$selection.groups.toppings.c", "cheese", "جبنة", "0", { amount: "10", included: true })
    ];
    expect(networkCartChoiceLabels(lines)).toEqual([
      { label: "2 × زيتون", nested: false }, { label: "1 × جبنة", nested: false }
    ]);
  });

  it("keeps nested and repeated linked branches independent", () => {
    const lines = [
      line("$selection.groups.combo.a", "slot", "البيتزا الأولى", "50", { sourceProductId: "pizza" }),
      { ...line("$selection.groups.combo.a.linked.sizes", "small", "صغير", "0"), kind: "SIZE" as const },
      line("$selection.groups.combo.a.linked.toppings.x", "olive", "زيتون", "8"),
      line("$selection.groups.combo.b", "slot", "البيتزا الثانية", "50", { sourceProductId: "pizza" }),
      { ...line("$selection.groups.combo.b.linked.sizes", "large", "كبير", "0"), kind: "SIZE" as const }
    ];
    expect(networkCartChoiceLabels(lines)).toEqual([
      { label: "1 × البيتزا الأولى", nested: false },
      { label: "صغير", nested: true },
      { label: "1 × زيتون", nested: true },
      { label: "1 × البيتزا الثانية", nested: false },
      { label: "كبير", nested: true }
    ]);
  });
});
