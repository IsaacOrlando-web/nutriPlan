// Route guard. Owner: Lead. Every page except the public ones needs a signed-in user, otherwise it
// redirects to /welcome. "Signed in" follows AUTH_MODE exactly like getSession() in lib/auth/session.ts:
// clerk (AUTH_MODE=clerk, or Clerk keys configured) -> a Clerk session only (a stale demo cookie does
// not count), supabase -> an `sb-*` cookie, local -> the demo cookie `np_uid`. API routes are never redirected; they answer 401 through getSession().
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PAGES = [/^\/welcome$/, /^\/login$/, /^\/signup$/, /^\/sign-up(\/.*)?$/, /^\/sign-in(\/.*)?$/];

const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function isPublic(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/trpc") ||
    pathname.startsWith("/__clerk") ||
    PUBLIC_PAGES.some((re) => re.test(pathname))
  );
}

// With Clerk configured, only a Clerk session counts (same rule as isClerkMode() in lib/auth/session.ts).
function hasCookieSession(req: NextRequest): boolean {
  if (clerkEnabled && process.env.AUTH_MODE !== "supabase") return false;
  if (process.env.AUTH_MODE === "clerk") return false;
  if (process.env.AUTH_MODE === "supabase") return req.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  return req.cookies.has("np_uid");
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

function guard(req: NextRequest, clerkSignedIn: boolean) {
  const { pathname } = req.nextUrl;
  const signedIn = clerkSignedIn || hasCookieSession(req);
  // Signed-in users have nothing to do on the landing page; send them to the app.
  if (signedIn && pathname === "/welcome") return redirectTo(req, "/");
  if (signedIn || isPublic(pathname)) return NextResponse.next();
  return redirectTo(req, "/welcome");
}

export default clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      const { userId } = await auth();
      return guard(req, Boolean(userId));
    })
  : (req: NextRequest) => guard(req, false);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
