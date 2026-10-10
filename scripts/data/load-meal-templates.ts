// Validates scripts/data/meal-templates.json against foods.json and upserts the templates into the store. Owner: Backend.
//   npm run data:templates                 (DATA_BACKEND=memory writes .data/store.json; =supabase writes meal_templates)
//   npm run data:templates -- --check      validate only
import fs from "node:fs";
import path from "node:path";
import { CandidateMealSchema } from "@/agents/schemas";
import { getStore } from "@/lib/db";
import type { CandidateMeal, Food } from "@/types/contracts";

const ROOT = path.resolve(__dirname, "../..");
const FOODS = path.join(ROOT, "scripts/data/foods.json");
const TEMPLATES = path.join(ROOT, "scripts/data/meal-templates.json");

const TemplateSchema = CandidateMealSchema.omit({ tasteScore: true });

export function validateTemplates(templates: unknown[], foods: Food[]): { valid: Omit<CandidateMeal, "tasteScore">[]; errors: string[] } {
  const ids = new Set(foods.map((f) => f.foodId));
  const seen = new Set<string>();
  const errors: string[] = [];
  const valid: Omit<CandidateMeal, "tasteScore">[] = [];
  templates.forEach((raw, i) => {
    const parsed = TemplateSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push(`template #${i}: ${issue.path.join(".")}: ${issue.message}`);
      return;
    }
    const t = parsed.data;
    if (seen.has(t.candidateId)) errors.push(`${t.candidateId}: duplicate candidateId`);
    seen.add(t.candidateId);
    for (const ing of t.ingredients) {
      if (!ids.has(ing.foodId)) errors.push(`${t.candidateId}: unknown foodId "${ing.foodId}"`);
      if (ing.minServings > ing.maxServings) errors.push(`${t.candidateId}: ${ing.foodId} minServings > maxServings`);
    }
    valid.push(t);
  });
  return { valid, errors };
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const foods = JSON.parse(fs.readFileSync(FOODS, "utf8")) as Food[];
  const templates = JSON.parse(fs.readFileSync(TEMPLATES, "utf8")) as unknown[];
  const { valid, errors } = validateTemplates(templates, foods);
  for (const e of errors) console.error(`  ${e}`);
  if (errors.length) {
    console.error(`${errors.length} problem(s) in ${path.relative(process.cwd(), TEMPLATES)}`);
    process.exit(1);
  }
  console.log(`${valid.length} templates valid against ${foods.length} foods`);
  if (checkOnly) return;

  const store = getStore();
  await store.upsertMealTemplates(valid);
  // The memory store persists on a short debounce; give it a moment before the process exits.
  await new Promise((r) => setTimeout(r, 400));
  console.log(`upserted ${valid.length} templates into the ${store.kind} store`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
