// GET /api/upload/[id] -> the uploaded image (local store only). Owner: Backend.
// The id is "<uuid>.<ext>" written by POST /api/upload; anything else is rejected so no path traversal is possible.
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { HttpError, handler } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const match = ID_RE.exec(id);
  if (!match) throw new HttpError(404, "Not found");
  const file = path.resolve(process.cwd(), ".data", "uploads", id);
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(file);
  } catch {
    throw new HttpError(404, "Not found");
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": TYPE_BY_EXT[match[1]],
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
