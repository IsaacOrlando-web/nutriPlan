// POST /api/auth/logout -> 204. Clears the JWT cookie.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { handler } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (_req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set("np_uid", "", { path: "/", maxAge: 0 });
  return res;
});
