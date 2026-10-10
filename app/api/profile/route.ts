// GET /api/profile -> ProfileBundle (404 when none). POST /api/profile ProfileInput -> ProfileBundle. Owner: Backend.
// POST runs Doctor's deterministic rule engine (buildConstraints) and Math's calculateTargets, then saves all three.
import type { NextRequest } from "next/server";
import type { UserProfile } from "@/types/contracts";
import { ProfileInputSchema } from "@/agents/schemas";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { HttpError, handler, json, parseBody } from "@/lib/api/http";
import { getBundle, rebuildBundle } from "./bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const bundle = await getBundle(getStore(), userId);
  if (!bundle) throw new HttpError(404, "No profile yet");
  return json(bundle);
});

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const input = await parseBody(req, ProfileInputSchema);
  const profile: UserProfile = { ...input, userId };
  const bundle = await rebuildBundle(getStore(), profile);
  return json(bundle);
});
