// Planner route helpers: typed planner errors -> HTTP responses with a `code` the UI can act on. Owner: Agents.
import type { PlannerApiError } from "@/types/contracts";
import { HttpError, json } from "@/lib/api/http";
import { getStore } from "@/lib/db";
import {
  PlannerBusyError,
  PlannerConfigError,
  PlannerNotFoundError,
  PlannerRateLimitError,
  PlannerValidationError,
} from "@/agents/planner";

/** Body size limits per route family (bytes). */
export const LIMITS = { generate: 16_384, preferences: 16_384, favorites: 65_536, state: 131_072 } as const;

export function plannerError(err: unknown) {
  const body = (status: number, error: string, code?: PlannerApiError["code"]) =>
    json<PlannerApiError>(code ? { error, code } : { error }, { status });
  if (err instanceof PlannerConfigError) return body(503, err.message, err.code);
  if (err instanceof PlannerRateLimitError) return body(429, err.message, err.code);
  if (err instanceof PlannerBusyError) return body(409, err.message, err.code);
  if (err instanceof PlannerValidationError) return body(422, err.message, err.code);
  if (err instanceof PlannerNotFoundError) return body(404, err.message);
  return null;
}

/** Runs a planner action and maps typed errors; anything else falls through to `handler` (500). */
export async function runPlanner<T>(fn: () => Promise<T>, ok: (value: T) => Response): Promise<Response> {
  try {
    return ok(await fn());
  } catch (err) {
    const res = plannerError(err);
    if (res) return res;
    throw err;
  }
}

export async function requireProfile(userId: string): Promise<void> {
  if (!(await getStore().getProfile(userId))) throw new HttpError(404, "Complete onboarding before planning meals");
}

