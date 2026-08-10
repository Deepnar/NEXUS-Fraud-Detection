import { NextRequest, NextResponse } from "next/server";
import {
  OFFICER_SESSION_COOKIE,
  verifyOfficerToken,
} from "@/lib/officer-session-edge";

/**
 * Authorization middleware.
 *
 * - /officer/* pages and /api/officer/* routes require a valid officer JWT
 *   (except /officer/login and POST /api/officer/auth/login).
 * - /admin/* and /api/admin/* additionally require the ADMIN role.
 *
 * This is the first gate only: every mutation API re-checks ownership and
 * role server-side. Never rely on hidden UI as authorization.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(OFFICER_SESSION_COOKIE)?.value;
  const payload = token ? await verifyOfficerToken(token) : null;

  const isOfficerPage = pathname === "/officer" || pathname.startsWith("/officer/");
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isOfficerApi = pathname.startsWith("/api/officer");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isOfficerPage && !isAdminPage && !isOfficerApi && !isAdminApi) {
    return NextResponse.next();
  }

  const isLoginPage = pathname === "/officer/login";
  const isLoginApi = pathname === "/api/officer/auth/login";

  // Public officer entry points.
  if ((isOfficerPage && isLoginPage) || (isOfficerApi && isLoginApi)) {
    return NextResponse.next();
  }

  if (!payload) {
    if (isOfficerApi || isAdminApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/officer/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if ((isAdminPage || isAdminApi) && payload.role !== "ADMIN") {
    if (isAdminApi) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/officer", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/officer/:path*",
    "/admin/:path*",
    "/api/officer/:path*",
    "/api/admin/:path*",
  ],
};
