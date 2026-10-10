// Route wrapper: KrogerError -> `{ error, code }` with its status; everything else goes through lib/api/http. Owner: Backend.
import { NextResponse, type NextRequest } from "next/server";
import { handler } from "@/lib/api/http";
import { KrogerError, type KrogerErrorCode } from "./client";

export interface KrogerErrorBody {
  error: string;
  code: KrogerErrorCode;
}

export function krogerError(err: KrogerError): NextResponse<KrogerErrorBody> {
  return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
}

export function krogerHandler<Ctx = unknown>(
  fn: (req: NextRequest, ctx: Ctx) => Promise<NextResponse | Response>,
): (req: NextRequest, ctx: Ctx) => Promise<NextResponse | Response> {
  return handler<Ctx>(async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof KrogerError) return krogerError(err);
      throw err;
    }
  });
}
