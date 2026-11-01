import { describe, expect, it } from "vitest";
import { invoiceDragHeight, shouldExpandInvoice } from "./invoice-sheet-motion";

describe("checkout invoice sheet motion", () => {
  it("moves continuously between the two snap heights, including a reversed drag", () => {
    expect(invoiceDragHeight(200, 600, 200, 700, 650)).toBe(250);
    expect(invoiceDragHeight(200, 600, 200, 700, 500)).toBe(400);
    expect(invoiceDragHeight(200, 600, 200, 700, 620)).toBe(280);
    expect(invoiceDragHeight(200, 600, 200, 700, 100)).toBe(600);
    expect(invoiceDragHeight(200, 600, 600, 300, 900)).toBe(200);
  });

  it("snaps by midpoint for a slow release and by direction for a fast release", () => {
    const base = { collapsed: 200, expanded: 600, wasExpanded: false, moved: true, cancelled: false };
    expect(shouldExpandInvoice({ ...base, current: 450, velocity: 0.1 })).toBe(true);
    expect(shouldExpandInvoice({ ...base, current: 350, velocity: 0.1 })).toBe(false);
    expect(shouldExpandInvoice({ ...base, current: 350, velocity: 0.6 })).toBe(true);
    expect(shouldExpandInvoice({ ...base, current: 450, velocity: -0.6 })).toBe(false);
  });

  it("keeps the previous state on touch cancellation", () => {
    const base = { collapsed: 200, expanded: 600, current: 400, velocity: 1, moved: true, cancelled: true };
    expect(shouldExpandInvoice({ ...base, wasExpanded: false })).toBe(false);
    expect(shouldExpandInvoice({ ...base, wasExpanded: true })).toBe(true);
  });
});
