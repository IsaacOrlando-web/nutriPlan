// POST /api/demo/reset { user: "alex" | "maria" } -> 204. Restores the seeded demo user and signs in as them. Owner: Backend.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, authMode } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { DEMO_EMAILS, DEMO_USER_IDS } from "@/lib/db/seed/demo-users";
import { handler, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResetSchema = z.object({ user: z.enum(["alex", "maria"]) });

export const POST = handler(async (req: NextRequest) => {
  const { user } = await parseBody(req, ResetSchema);
  const userId = DEMO_USER_IDS[user];
  await getStore().resetUser(userId);
  const res = new NextResponse(null, { status: 204 });
  if (authMode() === "local") {
    res.cookies.set(SESSION_COOKIE, `${userId}|${DEMO_EMAILS[user]}`, {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
});
