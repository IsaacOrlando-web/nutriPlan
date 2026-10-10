// Route guard. Every page except the public ones needs a valid JWT session, otherwise it redirects to /welcome.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "np_session";
const MOCK_SESSION_COOKIE = "np_uid";

const PUBLIC_PAGES = [/^\/welcome$/, /^\/login$/, /^\/sign-in(\/.*)?$/];

function isPublic(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/trpc") ||
    PUBLIC_PAGES.some((re) => re.test(pathname))
  );
}

function hasCookieSession(req: NextRequest): boolean {
  if (process.env.AUTH_MODE === "supabase") return req.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (req.cookies.has(SESSION_COOKIE)) return true;
  // Mock login has no server-issued JWT; only allow its demo cookie in mock mode.
  return process.env.NEXT_PUBLIC_USE_MOCKS === "true" && req.cookies.has(MOCK_SESSION_COOKIE);
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

function guard(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedIn = hasCookieSession(req);
  // Signed-in users have nothing to do on the landing page; send them to the app.
  if (signedIn && pathname === "/welcome") return redirectTo(req, "/");
  if (signedIn || isPublic(pathname)) return NextResponse.next();
  return redirectTo(req, "/welcome");
}

export default (req: NextRequest) => guard(req);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
