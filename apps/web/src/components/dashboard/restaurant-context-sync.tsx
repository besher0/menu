"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { setStoredRestaurant } from "@/lib/session";

export function RestaurantContextSync() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const id = searchParams.get("restaurantId");
    const slug = searchParams.get("restaurantSlug");
    const name = searchParams.get("restaurantName") ?? undefined;

    if (id && slug) {
      setStoredRestaurant({ id, slug, name });
    }
  }, [searchParams]);

  return null;
}
