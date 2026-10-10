// Loads system prompts from agents/prompts/*.md at runtime (Node runtime, cwd = project root). Owner: Agents.
import fs from "node:fs";
import path from "node:path";

export type PromptName =
  "orchestrator" | "doctor" | "chef" | "chef_columns" | "budget" | "monitor" | "coach" | "recipes" | "vision";

const cache = new Map<PromptName, string>();

const FALLBACK: Record<PromptName, string> = {
  orchestrator:
    "You are the Orchestrator, a neutral referee. Keep messages under 140 characters. Never invent numbers.",
  doctor:
    "You are the Doctor, calm and firm. Use only the constraints you are given. Never change or invent numbers. Under 140 characters.",
  chef: "You are the Chef, passionate and playful. Propose meals by ingredient names only. Never state nutrition numbers.",
  chef_columns:
    "You are the Chef. Answer the optimizer's brief with a few new meals of the requested types, by ingredient names from the allowed list only. Never state numbers.",
  budget:
    "You are Budget, practical and funny about money. Quote only the figures you are given. Under 140 characters.",
  monitor:
    "You are Monitor, observant and encouraging. Quote only the trend facts you are given. Under 140 characters.",
  coach: "You are Coach, warm and concrete. Only quote numbers that appear in the context you are given.",
  recipes:
    "You are the Chef. Return exactly 2 meals (lunch and dinner) for this person by ingredient names only, avoiding excluded foods. Never state numbers.",
  vision:
    "You identify foods in a photo and estimate grams. Return short ingredient names and gram estimates.",
};

export function loadPrompt(name: PromptName): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const candidates = [
    path.join(process.cwd(), "agents", "prompts", `${name}.md`),
    ...(typeof __dirname !== "undefined" ? [path.join(__dirname, `${name}.md`)] : []),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const text = fs.readFileSync(file, "utf8");
        cache.set(name, text);
        return text;
      }
    } catch {
      // try next
    }
  }
  return FALLBACK[name];
}
