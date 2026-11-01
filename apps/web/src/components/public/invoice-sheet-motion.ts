export function invoiceDragHeight(collapsed: number, expanded: number,
  startHeight: number, startY: number, currentY: number): number {
  return Math.max(collapsed, Math.min(expanded, startHeight + startY - currentY));
}

export function shouldExpandInvoice(input: {
  collapsed: number;
  expanded: number;
  current: number;
  wasExpanded: boolean;
  velocity: number;
  moved: boolean;
  cancelled: boolean;
}): boolean {
  if (input.cancelled) return input.wasExpanded;
  if (input.moved && Math.abs(input.velocity) > 0.35) return input.velocity > 0;
  return input.current > (input.collapsed + input.expanded) / 2;
}
