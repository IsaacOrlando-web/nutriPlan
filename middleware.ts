import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/welcome", "/login", "/signup"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  const signedIn = req.cookies.has("np_uid") || req.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (signedIn) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/welcome";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
