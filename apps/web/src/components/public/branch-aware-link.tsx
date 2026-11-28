"use client";

import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

// Opt-in navigation only. Legacy URLs (including old ?branch= QR links) are unchanged.
export function withSelectedBranch(href: string, branchId?: string | null) {
  if (!branchId || !href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://internal.ordersawa.invalid");
  if (url.pathname.endsWith("/branches") || url.searchParams.has("selectedBranch")) return href;
  url.searchParams.set("selectedBranch", branchId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export default function BranchAwareLink(props: ComponentProps<typeof NextLink>) {
  const searchParams = useSearchParams();
  const branchId = searchParams.get("selectedBranch");
  const href = typeof props.href === "string"
    ? withSelectedBranch(props.href, branchId)
    : props.href;
  return <NextLink {...props} href={href} />;
}
