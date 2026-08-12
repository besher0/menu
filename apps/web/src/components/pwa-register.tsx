"use client";

import { useEffect } from "react";
import { restaurantSlugFromHost } from "@/lib/public-routes";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    const isPublicRestaurantPath = window.location.pathname.startsWith("/m/")
      || Boolean(restaurantSlugFromHost(window.location.host));

    if (!isPublicRestaurantPath) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }

    navigator.serviceWorker.register("/sw.js")
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, []);

  return null;
}
