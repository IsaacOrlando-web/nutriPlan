// Agent model table and run mode. Owner: Agents.
// Model ids live ONLY here. Env overrides: MODEL_DOCTOR, MODEL_CHEF, MODEL_BUDGET, MODEL_MONITOR,
// MODEL_ORCHESTRATOR, MODEL_COACH, MODEL_VISION_A, MODEL_VISION_B as "provider:model-id" or "model-id".
// AGENTS_MODE=live|scripted (default: live when any provider key is present, scripted otherwise).

export type Provider = "anthropic" | "openai" | "google";
export type AgentKey = "doctor" | "chef" | "budget" | "monitor" | "orchestrator" | "coach" | "visionA" | "visionB";
export type AgentsMode = "live" | "scripted";

export interface ModelChoice {
  provider: Provider;
  model: string;
}

export interface AgentModelConfig {
  primary: ModelChoice;
  backup: ModelChoice | null;
}

/** Per call timeout and retry policy for every LLM request. */
export const LLM_TIMEOUT_MS = 15_000;
export const LLM_RETRIES = 1;

export const PROVIDER_ENV_KEYS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

const SONNET: ModelChoice = { provider: "anthropic", model: "claude-sonnet-4-5" };
const HAIKU: ModelChoice = { provider: "anthropic", model: "claude-haiku-4-5" };
const GPT_MINI: ModelChoice = { provider: "openai", model: "gpt-4.1-mini" };
const GEMINI_FLASH: ModelChoice = { provider: "google", model: "gemini-2.5-flash" };

export const MODEL_TABLE: Record<AgentKey, AgentModelConfig> = {
  doctor: { primary: SONNET, backup: GPT_MINI },
  chef: { primary: GPT_MINI, backup: GEMINI_FLASH },
  budget: { primary: HAIKU, backup: GPT_MINI },
  monitor: { primary: HAIKU, backup: GEMINI_FLASH },
  orchestrator: { primary: SONNET, backup: GPT_MINI },
  coach: { primary: SONNET, backup: GPT_MINI },
  visionA: { primary: SONNET, backup: null },
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
