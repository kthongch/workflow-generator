import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // Auth bypass — set NEXT_PUBLIC_AUTH_ENABLED=true to enable SSO
  if (process.env.NEXT_PUBLIC_AUTH_ENABLED !== "true") {
    return NextResponse.next();
  }

  // If auth enabled — redirect to login if no session cookie
  const token = req.cookies.get("next-auth.session-token") 
    ?? req.cookies.get("__Secure-next-auth.session-token");

  if (!token && !req.nextUrl.pathname.startsWith("/login") && !req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
