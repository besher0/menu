import { describe, expect, it } from "vitest";
import { calculatePrice, sumMoney, type PriceLine } from "@menu/shared";
import { includedQuantityDemo } from "../dashboard/product-configuration/demos";
import { summarizeConfigurationPriceLines } from "./product-configurator-summary";

const size: PriceLine = { kind: "SIZE", path: "$selection.groups.sizes", nodeId: "small", label: "صغير", amount: "100", chargedAmount: "100", included: false };
function option(instanceId: string, amount = "5", included = false): PriceLine {
  return { kind: "OPTION", path: `$selection.groups.extras.${instanceId}`, nodeId: "olive", instanceId,
    label: "زيتون", amount, chargedAmount: included ? "0" : amount, included };
}

describe("customer price summary presentation", () => {
  it("starts with the actual product and selected size, groups matching leaf units, and keeps charges Decimal-safe", () => {
    const rows = summarizeConfigurationPriceLines([size, option("a"), option("b"), option("c")], "بيتزا مارغريتا");
    expect(rows).toEqual([
      { label: "1 × بيتزا مارغريتا — صغير", chargedAmount: "100", included: false },
      { label: "3 × زيتون", chargedAmount: "15", included: false }
    ]);
  });

  it("does not merge included, differently priced, nested or linked instances", () => {
    const branched = option("nested");
    const child: PriceLine = { ...option("child"), path: `${branched.path}.children.sauce.child`, nodeId: "sauce", label: "رانش" };
    const linked = { ...option("linked"), sourceProductId: "source-pizza" };
    const rows = summarizeConfigurationPriceLines([option("a"), option("b", "5", true), option("c", "7"), branched, child, linked], "بيتزا");
    expect(rows.map((row) => row.label)).toEqual([
      "1 × بيتزا", "1 × زيتون", "1 × زيتون", "1 × زيتون", "1 × زيتون", "1 × رانش", "1 × زيتون"
    ]);
    expect(rows.map((row) => row.chargedAmount)).toEqual([undefined, "5", "0", "7", "5", "5", "5"]);
  });

  it("keeps real included-unit charges as zero and reconciles the summary with the Shared quote", () => {
    const configuration = includedQuantityDemo("included", 1);
    const selection = { schemaVersion: 1 as const, productId: "included", configurationRevision: 1, groups: [{
      type: "OPTIONS" as const, groupId: "demo-included-toppings", instances: [
        { instanceId: "m", optionId: "demo-included-mushroom" },
        { instanceId: "c", optionId: "demo-included-cheese" },
        { instanceId: "l", optionId: "demo-included-meat" }
      ]
    }] };
    const quote = calculatePrice(configuration, selection, { catalogId: "demo", linkedProducts: new Map() });
    expect(quote.valid).toBe(true);
    expect(quote.total).toBe("115");
    const rows = summarizeConfigurationPriceLines(quote.lines, "بيتزا");
    expect(rows.filter((row) => row.included).map((row) => [row.label, row.chargedAmount])).toEqual([
      ["1 × مشروم", "0"], ["1 × لحم", "0"]
    ]);
    expect(sumMoney(rows.map((row) => row.chargedAmount ?? "0"))).toBe(quote.total);
  });
});
