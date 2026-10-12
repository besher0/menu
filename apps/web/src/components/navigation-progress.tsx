"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function shouldTrackNavigation(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  const currentUrl = new URL(window.location.href);

  if (nextUrl.origin !== currentUrl.origin) return false;
  return nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    function stop() {
      window.clearTimeout(timeoutRef.current ?? undefined);
      const elapsed = Date.now() - startedAtRef.current;
      const remaining = Math.max(520 - elapsed, 180);
      setDone(true);
      timeoutRef.current = window.setTimeout(() => {
        setActive(false);
        setDone(false);
      }, remaining);
    }

    stop();
    return () => window.clearTimeout(timeoutRef.current ?? undefined);
  }, [pathname, searchParams]);

  useEffect(() => {
    function start() {
      window.clearTimeout(timeoutRef.current ?? undefined);
      startedAtRef.current = Date.now();
      setDone(false);
      setActive(true);
      timeoutRef.current = window.setTimeout(() => {
        setActive(false);
        setDone(false);
      }, 8000);
    }

    function onClick(event: MouseEvent) {
      if (isModifiedClick(event)) return;

      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!(target instanceof HTMLAnchorElement) || !shouldTrackNavigation(target)) return;

      start();
    }

    window.addEventListener("app:navigation-start", start);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("app:navigation-start", start);
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timeoutRef.current ?? undefined);
    };
  }, []);

  return <div className={`navigation-progress ${active ? "active" : ""} ${done ? "done" : ""}`} aria-hidden="true" />;
}
