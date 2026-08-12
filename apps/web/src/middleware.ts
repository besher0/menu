import { NextResponse, type NextRequest } from "next/server";
import { restaurantSlugFromHost } from "@/lib/public-routes";

const PUBLIC_FILE_PATTERN = /\/[^/]+\.[^/]+$/;

export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");

  const host = forwardedHost ?? hostHeader ?? "";

  const restaurantSlug = restaurantSlugFromHost(host);

  if (!restaurantSlug) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (shouldBypass(pathname)) {
    return NextResponse.next();
  }

  const rewriteUrl = request.nextUrl.clone();

  rewriteUrl.pathname =
    pathname === "/"
      ? `/m/${restaurantSlug}`
      : `/m/${restaurantSlug}${pathname}`;

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