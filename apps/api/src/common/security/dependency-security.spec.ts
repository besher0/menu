import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

describe("ExcelJS security dependency compatibility", () => {
  it("retains CommonJS v4 and rejects truncated v5 output buffers", () => {
    const { v4, v5 } = require("uuid");
    expect(v4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(() => v5("synthetic", v5.DNS, new Uint8Array(8), 4)).toThrow(RangeError);
  });
  it("round-trips an Excel workbook through the conditional-formatting UUID path", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Synthetic");
    sheet.addRows([["منتج", "السعر"], ["بيتزا", 1000], ["Water", 0]]);
    sheet.addConditionalFormatting({ ref: "B2:B3", rules: [{ type: "dataBar", priority: 1,
      cfvo: [{ type: "min" }, { type: "max" }], gradient: false }] });
    const buffer = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(buffer);
    expect(restored.worksheets[0].getCell("A2").value).toBe("بيتزا");
    expect(restored.worksheets[0].getCell("B2").value).toBe(1000);
    expect(restored.worksheets[0].getCell("B3").value).toBe(0);
    expect((restored.worksheets[0] as unknown as { conditionalFormattings: ExcelJS.ConditionalFormattingOptions[] }).conditionalFormattings[0].rules[0].type).toBe("dataBar");
  });
});
