import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfigurationTreePanel } from "./configuration-workspace";
import { pizzaMargheritaDemo } from "./demos";

describe("ConfigurationTreePanel", () => {
  it("renders the recursive Arabic tree with stable node identifiers", () => {
    const configuration = pizzaMargheritaDemo("product-1", 1);
    const tree = React.createElement(ConfigurationTreePanel, {
      configuration,
      onChange: () => undefined,
      selectedId: "demo-extra-cheese-small",
      onSelect: () => undefined
    });
    const html = renderToStaticMarkup(React.createElement("div", { dir: "rtl" }, tree));
    expect(html).toContain("بنية الشبكة");
    expect(html).toContain("حجم البيتزا");
    expect(html).toContain("جبنة إضافية");
    expect(html).toContain("pc-tree-branches");
  });
});
