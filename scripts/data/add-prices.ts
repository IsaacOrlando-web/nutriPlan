// Applies scripts/data/prices.csv (food_id, price_usd_per_100g, ...) to foods.json. Owner: Backend.
//   npm run data:prices            writes priceUsdPer100g into foods.json
//   npm run data:prices -- --dry-run   prints the changes only
import fs from "node:fs";
import path from "node:path";
import type { Food } from "@/types/contracts";

const ROOT = path.resolve(__dirname, "../..");
const FOODS = path.join(ROOT, "scripts/data/foods.json");
const PRICES = path.join(ROOT, "scripts/data/prices.csv");

/** Minimal CSV parser (handles quoted fields with commas). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((c) => c.length)) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const foods = JSON.parse(fs.readFileSync(FOODS, "utf8")) as Food[];
  const prices = parseCsv(fs.readFileSync(PRICES, "utf8"));
  const byId = new Map(prices.map((p) => [p.food_id, Number(p.price_usd_per_100g)]));

  let changed = 0;
  const unknown: string[] = [];
  for (const id of byId.keys()) if (!foods.some((f) => f.foodId === id)) unknown.push(id);
  for (const f of foods) {
    const price = byId.get(f.foodId);
    if (price === undefined || !Number.isFinite(price)) continue;
    const rounded = Math.round(price * 100) / 100;
    if (f.priceUsdPer100g !== rounded) {
      console.log(`${f.foodId}: ${f.priceUsdPer100g ?? "none"} -> ${rounded}`);
      f.priceUsdPer100g = rounded;
      changed++;
    }
  }
  const missing = foods.filter((f) => f.priceUsdPer100g === undefined).map((f) => f.foodId);
  if (unknown.length) console.warn(`prices.csv rows without a food: ${unknown.join(", ")}`);
  if (missing.length) console.warn(`foods without a price: ${missing.join(", ")}`);
  console.log(`${changed} price(s) changed, ${foods.length} foods, ${prices.length} csv rows`);
  if (!dryRun && changed > 0) {
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
