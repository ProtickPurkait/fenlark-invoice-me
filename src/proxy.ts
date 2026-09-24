import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirects only: the cookie's presence is checked here, while
 * the session itself is validated against the database in every page/action.
 */
const STAFF_COOKIE = "fl_session";
const PORTAL_COOKIE = "fl_portal";

const PUBLIC_PREFIXES = ["/login", "/portal/login", "/portal/verify", "/p/", "/brand/", "/api/webhooks/", "/api/cron/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    if (request.cookies.has(PORTAL_COOKIE)) return NextResponse.next();
    const url = new URL("/portal/login", request.url);
    if (pathname !== "/portal") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (request.cookies.has(STAFF_COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/" && pathname !== "/dashboard") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
