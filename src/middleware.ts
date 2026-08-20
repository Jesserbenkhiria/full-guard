import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/api/health"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Auth placeholder: when AUTH_ENABLED=true, redirect unauthenticated users to /login
  if (process.env.AUTH_ENABLED === "true") {
    const session = request.cookies.get("guard-session");
    if (!session && !pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
