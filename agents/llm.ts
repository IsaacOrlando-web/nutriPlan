// callObject: the single door to every LLM. Owner: Agents.
// Vercel AI SDK v5 generateObject with a Zod schema, 15 s timeout, one retry, then the backup model.
// Throws NoLlmError in scripted mode or when no provider key exists so callers use their scripted path.
// Logs every call to store.addAgentLog without photo data URLs.
import fs from "node:fs";
import path from "node:path";
import { generateObject, type ModelMessage, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { z } from "zod";
import { getStore } from "@/lib/db";
import { describeModel, getAgentsMode, LLM_RETRIES, LLM_TIMEOUT_MS, PROVIDER_ENV_KEYS, resolveModels, type AgentKey, type ModelChoice } from "./config";

export type NoLlmReason = "scripted" | "no_key" | "all_failed";

export class NoLlmError extends Error {
  constructor(
    public readonly reason: NoLlmReason,
    message?: string,
  ) {
    super(message ?? `LLM unavailable (${reason})`);
    this.name = "NoLlmError";
  }
}

export interface CallObjectArgs<T> {
  agent: AgentKey;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  runId?: string | null;
  /** Image URLs (https or data: URLs) or local paths under /public. Only vision agents pass these. */
  images?: string[];
  temperature?: number;
}

export interface CallObjectResult<T> {
  object: T;
  model: string;
  ms: number;
}

type ImagePart = { type: "image"; image: URL | string | Buffer; mediaType?: string };

function makeModel(choice: ModelChoice): LanguageModel {
  const apiKey = process.env[PROVIDER_ENV_KEYS[choice.provider]];
  switch (choice.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(choice.model);
    case "openai":
      return createOpenAI({ apiKey })(choice.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(choice.model);
  }
}

/** Turns a photo reference into an AI SDK image part. Local "/x.jpg" paths are read from /public. */
export function toImagePart(ref: string): ImagePart | null {
  if (ref.startsWith("data:")) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(ref);
    if (!m) return null;
    const mediaType = m[1] || "image/jpeg";
    const payload = m[2] ? m[3] : Buffer.from(decodeURIComponent(m[3])).toString("base64");
    return { type: "image", image: payload, mediaType };
  }
  if (/^https?:\/\//.test(ref)) {
    try {
      return { type: "image", image: new URL(ref) };
    } catch {
      return null;
    }
  }
  if (ref.startsWith("/")) {
    const local = path.join(process.cwd(), "public", ref);
    if (fs.existsSync(local)) {
      const ext = path.extname(local).toLowerCase().replace(".", "");
      const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return { type: "image", image: fs.readFileSync(local), mediaType };
    }
  }
  return null;
}

/** Strips data URLs and long base64 blobs so health photos never land in logs. */
export function stripDataUrls(text: string): string {
  return text.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "data:<stripped>");
}

function buildMessages(prompt: string, images: string[]): ModelMessage[] {
  const parts = images.map(toImagePart).filter((p): p is ImagePart => p !== null);
  return [{ role: "user", content: [{ type: "text", text: prompt }, ...parts] }];
}

async function attempt<T>(choice: ModelChoice, args: CallObjectArgs<T>): Promise<T> {
  const model = makeModel(choice);
  const hasImages = (args.images?.length ?? 0) > 0;
  const result = await generateObject({
    model,
    schema: args.schema,
    system: args.system,
    ...(hasImages ? { messages: buildMessages(args.prompt, args.images!) } : { prompt: args.prompt }),
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    maxRetries: 0,
    temperature: args.temperature ?? 0.7,
  });
  return result.object as T;
}

/** Errors a retry cannot fix: out of credits, bad key, retired model, request rejected by schema. */
export function isPermanentProviderError(message: string): boolean {
  return /no credits|insufficient_quota|exceeded your current quota|billing|invalid.*api key|incorrect api key|authentication|unauthorized|permission denied|no longer available|not found|does not exist|unsupported model/i.test(
    message,
  );
}

async function safeLog(record: { runId: string | null; agent: string; model: string; input: unknown; output: unknown; ms: number }): Promise<void> {
  try {
    await getStore().addAgentLog(record);
  } catch {
    // logging must never break an agent
  }
}

/** Calls the agent's model chain with structured output. Returns the parsed object plus the model that answered. */
export async function callObjectWithModel<T>(args: CallObjectArgs<T>): Promise<CallObjectResult<T>> {
  if (getAgentsMode() === "scripted") throw new NoLlmError("scripted");
  const chain = resolveModels(args.agent);
  if (chain.length === 0) throw new NoLlmError("no_key", `No API key for agent ${args.agent}`);

  const started = Date.now();
  const errors: string[] = [];
  const inputForLog = { system: args.system.slice(0, 300), prompt: stripDataUrls(args.prompt).slice(0, 4000), images: args.images?.length ?? 0 };

  for (const choice of chain) {
    for (let tryNo = 0; tryNo <= LLM_RETRIES; tryNo++) {
      const t0 = Date.now();
      try {
        const object = await attempt(choice, args);
        const ms = Date.now() - t0;
        await safeLog({ runId: args.runId ?? null, agent: args.agent, model: describeModel(choice), input: inputForLog, output: object, ms });
        return { object, model: describeModel(choice), ms: Date.now() - started };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${describeModel(choice)} try ${tryNo + 1}: ${msg.slice(0, 200)}`);
        await safeLog({ runId: args.runId ?? null, agent: args.agent, model: describeModel(choice), input: inputForLog, output: { error: msg.slice(0, 300) }, ms: Date.now() - t0 });
        // Billing, auth and unknown-model errors will not fix themselves: skip the retry and move to the backup.
        if (isPermanentProviderError(msg)) break;
      }
    }
  }
  throw new NoLlmError("all_failed", errors.join(" | "));
}

/** Same as callObjectWithModel but returns only the object. */
export async function callObject<T>(args: CallObjectArgs<T>): Promise<T> {
  return (await callObjectWithModel(args)).object;
}

/** True when the LLM path should be attempted at all (mode live and at least one key for this agent). */
export function llmAvailable(agent: AgentKey): boolean {
  return getAgentsMode() === "live" && resolveModels(agent).length > 0;
}

/** Numbers an LLM text may mention: only those that appear in the facts we handed it. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

/**
 * Golden rule guard: an LLM never produces a number shown to the user. A phrase is accepted only when
 * every number in it also appears in the allowed set (numbers that code computed and passed in).
 */
export function onlyAllowedNumbers(text: string, allowed: Iterable<number | string>): boolean {
  const ok = new Set<string>();
  for (const a of allowed) {
    const s = String(a);
    ok.add(s);
    const n = Number(s);
    if (Number.isFinite(n)) {
      ok.add(String(Math.round(n)));
      ok.add(n.toFixed(1));
      ok.add(n.toFixed(2));
    }
  }
  return numbersIn(text).every((n) => ok.has(n) || ok.has(String(Number(n))));
}
