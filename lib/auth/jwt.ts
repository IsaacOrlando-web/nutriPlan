import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_DEV_SECRET = "nutriplan-development-jwt-secret-change-me";

function secret(): string {
  const value = process.env.AUTH_JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : DEFAULT_DEV_SECRET);
  if (!value) throw new Error("AUTH_JWT_SECRET is required in production");
  return value;
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

export interface JwtClaims {
  sub: string;
  email: string;
  exp: number;
}

export function signAccessToken(claims: JwtClaims): string {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  return `${input}.${signature(input)}`;
}

export function verifyAccessToken(token: string): JwtClaims | null {
  const [header, payload, provided] = token.split(".");
  if (!header || !payload || !provided) return null;
  const expected = signature(`${header}.${payload}`);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) return null;
  try {
    const claims = JSON.parse(decode(payload)) as JwtClaims;
    if (!claims.sub || !claims.email || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
