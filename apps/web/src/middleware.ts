import { NextResponse, type NextRequest } from "next/server";
import {
  INTERNAL_RESTAURANT_REWRITE_HEADER,
  INTERNAL_RESTAURANT_REWRITE_VALUE,
  INTERNAL_RESTAURANT_SLUG_HEADER,
  restaurantSlugFromHost
} from "@/lib/public-routes";

const PUBLIC_FILE_PATTERN = /\/[^/]+\.[^/]+$/;

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(INTERNAL_RESTAURANT_REWRITE_HEADER);
  requestHeaders.delete(INTERNAL_RESTAURANT_SLUG_HEADER);
  const { pathname, search } = request.nextUrl;

  if (pathname === "/m" || pathname.startsWith("/m/")) {
    return new NextResponse(null, {
      status: 404
    });
  }

  const host =
    request.headers.get("host") ??
    request.headers.get("x-forwarded-host") ??
    "";

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

  const rewriteUrl = new URL(
    `${internalPath}${search}`,
    "http://127.0.0.1:3000"
  );

  requestHeaders.set(INTERNAL_RESTAURANT_REWRITE_HEADER, INTERNAL_RESTAURANT_REWRITE_VALUE);
  requestHeaders.set(INTERNAL_RESTAURANT_SLUG_HEADER, restaurantSlug);

  return NextResponse.rewrite(rewriteUrl, {
    request: {
      headers: requestHeaders
    }
  });
}

function shouldBypass(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
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
