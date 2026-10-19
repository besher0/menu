import { describe, expect, it } from "vitest";
import type { PriceLine } from "@menu/shared";
import { summarizeConfigurationPriceLines } from "./product-configurator-summary";

const size: PriceLine = { kind: "SIZE", path: "$selection.groups.sizes", nodeId: "small", label: "صغير", amount: "100", chargedAmount: "100", included: false };
function option(instanceId: string, amount = "5", included = false): PriceLine {
  return { kind: "OPTION", path: `$selection.groups.extras.${instanceId}`, nodeId: "olive", instanceId,
    label: "زيتون", amount, chargedAmount: included ? "0" : amount, included };
}

describe("customer price summary presentation", () => {
  it("starts with the actual product and selected size, groups matching leaf units, and keeps charges Decimal-safe", () => {
    const rows = summarizeConfigurationPriceLines([size, option("a"), option("b"), option("c")], "بيتزا مارغريتا", 1);
    expect(rows).toEqual([
      { label: "1 × بيتزا مارغريتا — صغير", chargedAmount: "100", included: false },
      { label: "3 × زيتون", chargedAmount: "15", included: false }
    ]);
  });

  it("does not merge included, differently priced, nested or linked instances", () => {
    const branched = option("nested");
    const child: PriceLine = { ...option("child"), path: `${branched.path}.children.sauce.child`, nodeId: "sauce", label: "رانش" };
    const linked = { ...option("linked"), sourceProductId: "source-pizza" };
    const rows = summarizeConfigurationPriceLines([option("a"), option("b", "5", true), option("c", "7"), branched, child, linked], "بيتزا", 2);
    expect(rows.map((row) => row.label)).toEqual([
      "2 × بيتزا", "1 × زيتون", "1 × زيتون", "1 × زيتون", "1 × زيتون", "1 × رانش", "1 × زيتون"
    ]);
    expect(rows.map((row) => row.chargedAmount)).toEqual([undefined, "5", "0", "7", "5", "5", "5"]);
  });
});
