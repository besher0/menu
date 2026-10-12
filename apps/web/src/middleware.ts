import { NextResponse, type NextRequest } from "next/server";
import {
  hostnameFromHostHeader,
  INTERNAL_RESTAURANT_REWRITE_HEADER,
  INTERNAL_RESTAURANT_SLUG_HEADER,
  restaurantSlugFromHost
} from "@/lib/public-routes";

const PUBLIC_FILE_PATTERN = /\/[^/]+\.[^/]+$/;
const INTERNAL_RESTAURANT_REWRITE_TOKEN =
  process.env.INTERNAL_RESTAURANT_REWRITE_SECRET ??
  globalThis.crypto?.randomUUID?.() ??
  Math.random().toString(36).slice(2);

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const incomingInternalToken = requestHeaders.get(INTERNAL_RESTAURANT_REWRITE_HEADER);
  const incomingInternalSlug = requestHeaders.get(INTERNAL_RESTAURANT_SLUG_HEADER);
  requestHeaders.delete(INTERNAL_RESTAURANT_REWRITE_HEADER);
  requestHeaders.delete(INTERNAL_RESTAURANT_SLUG_HEADER);
  const { pathname, search } = request.nextUrl;

  if (pathname === "/m" || pathname.startsWith("/m/")) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.next({
        request: {
          headers: requestHeaders
        }
      });
    }

    if (
      incomingInternalToken === INTERNAL_RESTAURANT_REWRITE_TOKEN &&
      incomingInternalSlug &&
      incomingInternalSlug === restaurantSlugFromInternalPath(pathname)
    ) {
      return NextResponse.next({
        request: {
          headers: requestHeaders
        }
      });
    }

    return new NextResponse(null, {
      status: 404
    });
  }

  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";
  const publicHostname = hostnameFromHostHeader(host);
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "") ??
    "https";

  const restaurantSlug = restaurantSlugFromHost(host);

  if (!restaurantSlug) {
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  }

  if (shouldBypass(pathname)) {
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  }

  const internalPath =
    pathname === "/"
      ? `/m/${restaurantSlug}`
      : `/m/${restaurantSlug}${pathname}`;

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.protocol = protocol;
  rewriteUrl.hostname = publicHostname;
  rewriteUrl.port = process.env.NODE_ENV === "production" ? "" : request.nextUrl.port;
  rewriteUrl.pathname = internalPath;
  rewriteUrl.search = search;

  requestHeaders.set(INTERNAL_RESTAURANT_REWRITE_HEADER, INTERNAL_RESTAURANT_REWRITE_TOKEN);
  requestHeaders.set(INTERNAL_RESTAURANT_SLUG_HEADER, restaurantSlug);

  return NextResponse.rewrite(rewriteUrl, {
    request: {
      headers: requestHeaders
    }
  });
}

function restaurantSlugFromInternalPath(pathname: string) {
  return pathname.split("/")[2] ?? null;
}

function shouldBypass(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/q" ||
    pathname.startsWith("/q/") ||
    pathname.startsWith("/assets") ||
    pathname === "/m" ||
    pathname.startsWith("/m/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

export const config = {
  matcher: ["/:path*"]
};
