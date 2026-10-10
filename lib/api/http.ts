// Route handler helpers: JSON responses, Zod validation, uniform `{ error }` bodies. Owner: Backend.
// Every /app/api route uses these so error format and status codes stay consistent.
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";
import { UnauthorizedError } from "@/lib/auth/session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, init);
}

export function error(status: number, message: string): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status });
}

export interface ParseBodyOptions {
  /** Rejects larger bodies with 413 before parsing (checks Content-Length, then the actual size). */
  maxBytes?: number;
}

export async function parseBody<T>(
  req: NextRequest,
  schema: ZodType<T, ZodTypeDef, unknown>,
  opts: ParseBodyOptions = {},
): Promise<T> {
  let raw: unknown;
  if (opts.maxBytes !== undefined) {
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > opts.maxBytes)
      throw new HttpError(413, "Request body is too large");
    let text: string;
    try {
      text = await req.text();
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
    if (new TextEncoder().encode(text).length > opts.maxBytes)
      throw new HttpError(413, "Request body is too large");
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
  } else {
    try {
      raw = await req.json();
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, `${issue.path.join(".") || "body"}: ${issue.message}`);
  }
  return result.data;
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): T {
  const obj = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = schema.safeParse(obj);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, `${issue.path.join(".") || "query"}: ${issue.message}`);
  }
  return result.data;
}

/**
 * Wraps a handler so thrown HttpError / UnauthorizedError / unknown errors become `{ error }` responses.
 * Never leaks health data: unknown errors return a generic message and are logged without the body.
 */
export function handler<Ctx = unknown>(
  fn: (req: NextRequest, ctx: Ctx) => Promise<NextResponse | Response>,
): (req: NextRequest, ctx: Ctx) => Promise<NextResponse | Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return error(err.status, err.message);
      if (err instanceof UnauthorizedError) return error(401, "Not signed in");
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}:`, err instanceof Error ? err.message : err);
      return error(500, "Something went wrong");
    }
  };
}
