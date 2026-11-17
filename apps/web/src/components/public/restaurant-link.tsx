"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useRestaurantShell } from "./restaurant-shell-context";

// The shell already owns public summaries. Next route prefetch would read the
// whole menu again; actual outside-shell navigation still uses the Next router.
export default function RestaurantLink(props: ComponentProps<typeof NextLink>) {
  const shell = useRestaurantShell();
  return <NextLink {...props} prefetch={shell ? false : props.prefetch} />;
}
