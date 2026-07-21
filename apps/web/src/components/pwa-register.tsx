"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    if (!window.location.pathname.startsWith("/m/")) {
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
