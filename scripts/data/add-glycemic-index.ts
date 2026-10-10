// Adds glycemicIndex / giEstimated to foods.json. Owner: Backend.
// Published values come from the International Tables of Glycemic Index and Glycemic Load
// (Atkinson, Foster-Powell, Brand-Miller 2008; Atkinson, Brand-Miller et al. 2021), matched by foodId keyword.
// Anything else gets a category estimate and giEstimated: true (the optimizer treats it as uncertain).
//   npm run data:gi            writes foods.json
//   npm run data:gi -- --dry-run
//   npm run data:gi -- --force     also overwrite curated published values
import fs from "node:fs";
import path from "node:path";
import type { Food } from "@/types/contracts";

const ROOT = path.resolve(__dirname, "../..");
const FOODS = path.join(ROOT, "scripts/data/foods.json");

/** Published GI (glucose = 100). Keys are matched against the foodId (and name) as substrings, first match wins. */
export const PUBLISHED_GI: { keys: string[]; gi: number; source: string }[] = [
  { keys: ["white_rice", "jasmine_rice", "rice_white"], gi: 73, source: "Atkinson 2008, white rice boiled, mean" },
  { keys: ["brown_rice"], gi: 68, source: "Atkinson 2008, brown rice boiled" },
  { keys: ["basmati"], gi: 58, source: "Atkinson 2008, basmati" },
  { keys: ["quinoa"], gi: 53, source: "Atkinson 2021, quinoa cooked" },
  { keys: ["oats", "oatmeal", "porridge"], gi: 55, source: "Atkinson 2008, porridge rolled oats" },
  { keys: ["ww_bread", "whole_wheat_bread", "wholemeal_bread"], gi: 74, source: "Atkinson 2008, whole wheat bread" },
  { keys: ["white_bread"], gi: 75, source: "Atkinson 2008, white wheat bread" },
  { keys: ["ww_pita", "pita"], gi: 57, source: "Atkinson 2008, pita bread white" },
  { keys: ["ww_pasta", "whole_wheat_pasta"], gi: 48, source: "Atkinson 2008, spaghetti wholemeal" },
  { keys: ["pasta", "spaghetti"], gi: 49, source: "Atkinson 2008, spaghetti white boiled" },
  { keys: ["corn_tortilla"], gi: 52, source: "Atkinson 2008, corn tortilla" },
  { keys: ["flour_tortilla"], gi: 30, source: "Atkinson 2008, wheat tortilla" },
  { keys: ["arepa"], gi: 72, source: "Atkinson 2008, arepa (corn)" },
  { keys: ["popcorn"], gi: 65, source: "Atkinson 2008, popcorn" },
  { keys: ["sweet_potato"], gi: 63, source: "Atkinson 2008, sweet potato boiled" },
  { keys: ["potato"], gi: 78, source: "Atkinson 2008, potato boiled, mean" },
  { keys: ["plantain"], gi: 55, source: "Atkinson 2021, plantain cooked" },
  { keys: ["cassava", "yuca"], gi: 46, source: "Atkinson 2008, cassava boiled" },
  { keys: ["corn", "sweetcorn"], gi: 52, source: "Atkinson 2008, sweet corn" },
  { keys: ["black_beans"], gi: 30, source: "Atkinson 2008, black beans" },
  { keys: ["pinto_beans"], gi: 39, source: "Atkinson 2008, pinto beans" },
  { keys: ["kidney_beans"], gi: 24, source: "Atkinson 2008, kidney beans" },
  { keys: ["lentils"], gi: 32, source: "Atkinson 2008, lentils, mean" },
  { keys: ["chickpeas", "garbanzo"], gi: 28, source: "Atkinson 2008, chickpeas" },
  { keys: ["hummus"], gi: 6, source: "Atkinson 2008, hummus" },
  { keys: ["edamame", "soybeans"], gi: 16, source: "Atkinson 2008, soya beans" },
  { keys: ["banana"], gi: 51, source: "Atkinson 2008, banana, mean" },
  { keys: ["apple"], gi: 36, source: "Atkinson 2008, apple, mean" },
  { keys: ["orange"], gi: 43, source: "Atkinson 2008, orange, mean" },
  { keys: ["strawberr"], gi: 40, source: "Atkinson 2008, strawberries" },
  { keys: ["blueberr"], gi: 53, source: "Atkinson 2008, blueberries" },
  { keys: ["mango"], gi: 51, source: "Atkinson 2008, mango, mean" },
  { keys: ["papaya"], gi: 59, source: "Atkinson 2008, papaya" },
  { keys: ["kiwi"], gi: 58, source: "Atkinson 2008, kiwifruit" },
  { keys: ["grapes"], gi: 59, source: "Atkinson 2008, grapes" },
  { keys: ["watermelon"], gi: 76, source: "Atkinson 2008, watermelon" },
  { keys: ["pineapple"], gi: 59, source: "Atkinson 2008, pineapple" },
  { keys: ["peach"], gi: 42, source: "Atkinson 2008, peach" },
  { keys: ["pear"], gi: 38, source: "Atkinson 2008, pear" },
  { keys: ["raisins"], gi: 64, source: "Atkinson 2008, raisins" },
  { keys: ["dates"], gi: 42, source: "Atkinson 2021, dates" },
  { keys: ["carrot"], gi: 39, source: "Atkinson 2008, carrots boiled" },
  { keys: ["milk", "whole_milk", "skim_milk"], gi: 31, source: "Atkinson 2008, milk, mean" },
  { keys: ["greek_yogurt", "yogurt"], gi: 41, source: "Atkinson 2008, yogurt, mean" },
  { keys: ["honey"], gi: 61, source: "Atkinson 2008, honey, mean" },
  { keys: ["sugar", "sucrose"], gi: 65, source: "Atkinson 2008, sucrose" },
  { keys: ["chocolate"], gi: 40, source: "Atkinson 2008, chocolate, mean" },
  { keys: ["peanut"], gi: 14, source: "Atkinson 2008, peanuts" },
  { keys: ["cashew"], gi: 22, source: "Atkinson 2008, cashew nuts" },
  { keys: ["chia"], gi: 1, source: "Atkinson 2021, chia (negligible available carbs)" },
  { keys: ["couscous"], gi: 65, source: "Atkinson 2008, couscous" },
  { keys: ["bulgur"], gi: 48, source: "Atkinson 2008, bulgur" },
  { keys: ["barley"], gi: 28, source: "Atkinson 2008, pearl barley" },
  { keys: ["cornflakes"], gi: 81, source: "Atkinson 2008, cornflakes" },
  { keys: ["granola", "muesli"], gi: 57, source: "Atkinson 2008, muesli, mean" },
  { keys: ["crackers"], gi: 67, source: "Atkinson 2008, crackers, mean" },
  { keys: ["bagel"], gi: 69, source: "Atkinson 2008, bagel white" },
  { keys: ["pancake"], gi: 66, source: "Atkinson 2008, pancakes" },
  { keys: ["tomato"], gi: 38, source: "Atkinson 2008, tomato juice (proxy)" },
  { keys: ["pumpkin", "squash"], gi: 64, source: "Atkinson 2008, pumpkin boiled" },
  { keys: ["peas"], gi: 51, source: "Atkinson 2008, green peas" },
  { keys: ["beets", "beetroot"], gi: 64, source: "Atkinson 2008, beetroot" },
  { keys: ["ice_cream"], gi: 51, source: "Atkinson 2008, ice cream regular" },
  { keys: ["juice"], gi: 50, source: "Atkinson 2008, fruit juice, mean" },
];

/** Category estimate used when no published value matches. */
export function estimateGi(food: Food): number | undefined {
  const carbs = food.per100g.carbsG;
  const available = Math.max(0, carbs - food.per100g.fiberG);
  if (available < 3) return undefined; // protein, fat, leafy vegetables: no meaningful GI
  const tags = new Set(food.tags.map((t) => t.toLowerCase()));
  if (tags.has("legume")) return 35;
  if (tags.has("fruit")) return 50;
  if (tags.has("vegetable") || food.storeSection === "produce") return 45;
  if (tags.has("dairy")) return 35;
  if (tags.has("grain") || food.storeSection === "grains") return 65;
  if (tags.has("nuts") || tags.has("seeds")) return 20;
  if (food.per100g.sugarG / Math.max(carbs, 1) > 0.6) return 60; // mostly sugars (sauces, sweeteners)
  return 55;
}

export function applyGlycemicIndex(foods: Food[], opts: { force?: boolean } = {}): { matched: number; estimated: number; none: number; kept: number } {
  const stats = { matched: 0, estimated: 0, none: 0, kept: 0 };
  for (const f of foods) {
    // Curated published values (giEstimated: false with a number) win unless --force.
    if (!opts.force && !f.giEstimated && f.glycemicIndex !== undefined) {
      stats.kept++;
      continue;
    }
    const hay = `${f.foodId} ${f.name}`.toLowerCase().replace(/[\s-]+/g, "_");
    const hit = PUBLISHED_GI.find((row) => row.keys.some((k) => hay.includes(k)));
    if (hit) {
      f.glycemicIndex = hit.gi;
      f.giEstimated = false;
      stats.matched++;
      continue;
    }
    const estimate = estimateGi(f);
    if (estimate === undefined) {
      delete f.glycemicIndex;
      f.giEstimated = false; // no GI at all: nothing to estimate
      stats.none++;
    } else {
      f.glycemicIndex = estimate;
      f.giEstimated = true;
      stats.estimated++;
    }
  }
  return stats;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const foods = JSON.parse(fs.readFileSync(FOODS, "utf8")) as Food[];
  const before = new Map(foods.map((f) => [f.foodId, `${f.glycemicIndex ?? "-"}/${f.giEstimated}`]));
  const stats = applyGlycemicIndex(foods, { force });
  for (const f of foods) {
    const now = `${f.glycemicIndex ?? "-"}/${f.giEstimated}`;
    if (before.get(f.foodId) !== now) console.log(`${f.foodId}: ${before.get(f.foodId)} -> ${now}`);
  }
  console.log(`published: ${stats.matched}, estimated: ${stats.estimated}, no GI: ${stats.none}, curated kept: ${stats.kept}`);
  if (!dryRun) {
    fs.writeFileSync(FOODS, JSON.stringify(foods, null, 2) + "\n");
    console.log(`wrote ${path.relative(process.cwd(), FOODS)}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
