// Agent model table and run mode. Owner: Agents.
// Model ids live ONLY here. Env overrides: MODEL_DOCTOR, MODEL_CHEF, MODEL_BUDGET, MODEL_MONITOR,
// MODEL_ORCHESTRATOR, MODEL_COACH, MODEL_VISION_A, MODEL_VISION_B as "provider:model-id" or "model-id".
// AGENTS_MODE=live|scripted (default: live when any provider key is present, scripted otherwise).

export type Provider = "anthropic" | "openai" | "google";
export type AgentKey =
  "doctor" | "chef" | "budget" | "monitor" | "orchestrator" | "coach" | "visionA" | "visionB";
export type AgentsMode = "live" | "scripted";

export interface ModelChoice {
  provider: Provider;
  model: string;
}

export interface AgentModelConfig {
  primary: ModelChoice;
  backup: ModelChoice | null;
}

/**
 * Per call timeout and retry policy for every LLM request. One attempt per model, then the next model in the
 * chain: a timeout must never cost more than the call itself. Default timeout for agents not listed below.
 */
export const LLM_TIMEOUT_MS = 8_000;
export const LLM_RETRIES = 0;

/** Per agent timeout (ms). Chef writes recipes, vision reads images, coach writes a paragraph: a little longer. */
export const AGENT_TIMEOUT_MS: Partial<Record<AgentKey, number>> = {
  chef: 10_000,
  coach: 10_000,
  visionA: 10_000,
  visionB: 10_000,
};

/** maxOutputTokens sized to each agent's schema so a model cannot ramble past its timeout. */
export const AGENT_MAX_OUTPUT_TOKENS: Record<AgentKey, number> = {
  doctor: 600,
  chef: 2_500,
  budget: 600,
  monitor: 600,
  orchestrator: 600,
  coach: 900,
  visionA: 800,
  visionB: 800,
};

export function timeoutFor(agent: AgentKey): number {
  const env = Number(process.env.LLM_TIMEOUT_MS);
  if (Number.isFinite(env) && env > 0) return env;
  return AGENT_TIMEOUT_MS[agent] ?? LLM_TIMEOUT_MS;
}

export function maxOutputTokensFor(agent: AgentKey): number {
  return AGENT_MAX_OUTPUT_TOKENS[agent];
}

export const PROVIDER_ENV_KEYS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

// Verified against the providers on 2026-10-10 (scripts/check-models.mjs re-checks before a demo).
const SONNET: ModelChoice = { provider: "anthropic", model: "claude-sonnet-5-5" };
const HAIKU: ModelChoice = { provider: "anthropic", model: "claude-haiku-5-5" };
const GPT_MINI: ModelChoice = { provider: "openai", model: "gpt-4.1-mini" };
const GEMINI_FLASH: ModelChoice = { provider: "google", model: "gemini-3.5-flash" };

export const MODEL_TABLE: Record<AgentKey, AgentModelConfig> = {
  doctor: { primary: SONNET, backup: GEMINI_FLASH },
  // Measured 2026-10-10: Gemini 3.5 Flash answered "high demand" on 4 of 4 Chef calls (2 to 9 s lost each),
  // Haiku 5.5 finished the column brief in 5 to 8 s. Haiku leads; Gemini stays as the backup (MODEL_CHEF overrides).
  chef: { primary: HAIKU, backup: GEMINI_FLASH },
  budget: { primary: HAIKU, backup: GEMINI_FLASH },
  monitor: { primary: HAIKU, backup: GEMINI_FLASH },
  orchestrator: { primary: SONNET, backup: GEMINI_FLASH },
  coach: { primary: SONNET, backup: GEMINI_FLASH },
  visionA: { primary: SONNET, backup: HAIKU },
  visionB: { primary: GEMINI_FLASH, backup: GPT_MINI },
};

const ENV_OVERRIDE: Record<AgentKey, string> = {
  doctor: "MODEL_DOCTOR",
  chef: "MODEL_CHEF",
  budget: "MODEL_BUDGET",
  monitor: "MODEL_MONITOR",
  orchestrator: "MODEL_ORCHESTRATOR",
  coach: "MODEL_COACH",
  visionA: "MODEL_VISION_A",
  visionB: "MODEL_VISION_B",
};

export function hasKey(provider: Provider): boolean {
  const v = process.env[PROVIDER_ENV_KEYS[provider]];
  return typeof v === "string" && v.trim().length > 0;
}

export function anyProviderKey(): boolean {
  return (Object.keys(PROVIDER_ENV_KEYS) as Provider[]).some(hasKey);
}

/** Read at call time so tests and scripts can flip the mode with an env var before running. */
export function getAgentsMode(): AgentsMode {
  const forced = process.env.AGENTS_MODE;
  if (forced === "live" || forced === "scripted") return forced;
  return anyProviderKey() ? "live" : "scripted";
}

/** Snapshot at module load; prefer getAgentsMode() in code paths that may run after env changes. */
export const AGENTS_MODE: AgentsMode = getAgentsMode();

function parseOverride(raw: string, fallbackProvider: Provider): ModelChoice {
  const i = raw.indexOf(":");
  if (i > 0) {
    const provider = raw.slice(0, i) as Provider;
    if (provider in PROVIDER_ENV_KEYS) return { provider, model: raw.slice(i + 1) };
  }
  return { provider: fallbackProvider, model: raw };
}

export function modelConfigFor(agent: AgentKey): AgentModelConfig {
  const base = MODEL_TABLE[agent];
  const override = process.env[ENV_OVERRIDE[agent]];
  if (!override) return base;
  return { primary: parseOverride(override, base.primary.provider), backup: base.backup };
}

/** Ordered list of models to try for an agent: primary then backup, keeping only providers with a key. */
export function resolveModels(agent: AgentKey): ModelChoice[] {
  const cfg = modelConfigFor(agent);
  const list = [cfg.primary, ...(cfg.backup ? [cfg.backup] : [])];
  return list.filter((m) => hasKey(m.provider));
}

export function describeModel(m: ModelChoice): string {
  return `${m.provider}:${m.model}`;
}
