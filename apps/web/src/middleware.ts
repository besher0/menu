import { NextResponse, type NextRequest } from "next/server";
import { restaurantSlugFromHost } from "@/lib/public-routes";

const PUBLIC_FILE_PATTERN = /\/[^/]+\.[^/]+$/;

export function middleware(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";

  const restaurantSlug = restaurantSlugFromHost(host);

  if (!restaurantSlug) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (shouldBypass(pathname)) {
    return NextResponse.next();
  }

  const internalPath =
    pathname === "/"
      ? `/m/${restaurantSlug}`
      : `/m/${restaurantSlug}${pathname}`;

  const rewriteUrl = new URL(
    `${internalPath}${search}`,
    "http://127.0.0.1:3000"
  );

  return NextResponse.rewrite(rewriteUrl);
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