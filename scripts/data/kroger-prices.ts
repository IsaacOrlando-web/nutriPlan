// Prices scripts/data/foods.json from one real Kroger store through the Kroger Public API. Owner: Backend.
//   npx tsx scripts/data/kroger-prices.ts --zip 45202          pick the first store near the zip and write prices
//   KROGER_LOCATION_ID=01400943 npx tsx scripts/data/kroger-prices.ts
//   npx tsx scripts/data/kroger-prices.ts --dry-run            print the table only
//   npx tsx scripts/data/kroger-prices.ts --limit 10           first 10 foods (quick test)
// Writes priceUsdPer100g into foods.json and regenerates prices.csv with store, date_collected and a
// source_note per row ("Kroger API <productId> <size> $<price>"). Foods without a match keep their curated
// price and their existing prices.csv row. Reads .env.local for KROGER_* when the variables are not set.
import fs from "node:fs";
import path from "node:path";
import type { Food } from "@/types/contracts";
import { isKrogerConfigured, searchLocations, searchProducts } from "@/lib/kroger/client";
import { matchFoodToKroger, searchTermFor } from "@/lib/kroger/match";
import { mapPool } from "@/lib/kroger/pricing";
import { parseCsv } from "./add-prices";

const ROOT = path.resolve(__dirname, "../..");
const FOODS = path.join(ROOT, "scripts/data/foods.json");
const PRICES = path.join(ROOT, "scripts/data/prices.csv");
const CSV_HEADER = ["food_id", "name", "price_usd_per_100g", "store", "date_collected", "source_note"];

/** Minimal .env.local loader (no dependency): never overrides variables already in the environment. */
function loadEnvLocal(): void {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(["'])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined && value !== "") process.env[m[1]] = value;
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface Row {
  foodId: string;
  name: string;
  before: number | undefined;
  after: number | undefined;
  note: string;
}

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");
  const limit = Number(arg("--limit") ?? 0) || undefined;
  if (!isKrogerConfigured()) {
    console.error("Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET (see docs/kroger-setup.md).");
    process.exit(2);
  }

  let locationId = process.env.KROGER_LOCATION_ID;
  let storeName = process.env.KROGER_LOCATION_NAME ?? "Kroger";
  const zip = arg("--zip");
  if (zip) {
    const locations = await searchLocations(zip, { limit: 1 });
    if (!locations.length) {
      console.error(`No Kroger store near ${zip}`);
      process.exit(2);
    }
    locationId = locations[0].id;
    storeName = locations[0].name;
    console.log(`Store: ${storeName} (${locationId}) ${locations[0].address}`);
  }
  if (!locationId) {
    console.error("Pass --zip 45202 or set KROGER_LOCATION_ID.");
    process.exit(2);
  }

  const foods = JSON.parse(fs.readFileSync(FOODS, "utf8")) as Food[];
  const subset = limit ? foods.slice(0, limit) : foods;
  const today = new Date().toISOString().slice(0, 10);
  const existingCsv = fs.existsSync(PRICES) ? parseCsv(fs.readFileSync(PRICES, "utf8")) : [];
  const existingRows = new Map(existingCsv.map((r) => [r.food_id, r]));

  const rows = await mapPool(subset, 4, async (food): Promise<Row> => {
    const base = { foodId: food.foodId, name: food.name, before: food.priceUsdPer100g };
    try {
      const candidates = await searchProducts(searchTermFor(food), locationId!, 8);
      const match = matchFoodToKroger(food, candidates);
      if (!match)
        return {
          ...base,
          after: undefined,
          note: `no match for "${searchTermFor(food)}" (${candidates.length} candidates)`,
        };
      const price = Math.round(match.pricePer100g * 100) / 100;
      return {
        ...base,
        after: price,
        note: `Kroger API ${match.product.productId} ${match.product.size ?? ""} $${match.unitPriceUsd.toFixed(2)}`.trim(),
      };
    } catch (err) {
      return { ...base, after: undefined, note: `error: ${(err as Error).message}` };
    }
  });

  const matched = rows.filter((r) => r.after !== undefined);
  console.table(
    rows.map((r) => ({
      food: r.foodId,
      before: r.before ?? "",
      after: r.after ?? "",
      delta:
        r.before !== undefined && r.after !== undefined
          ? `${(((r.after - r.before) / r.before) * 100).toFixed(0)}%`
          : "",
      note: r.note,
    })),
  );
  console.log(
    `${matched.length}/${rows.length} foods priced at ${storeName} on ${today}${dryRun ? " (dry run, nothing written)" : ""}`,
  );
  if (dryRun || matched.length === 0) return;

  const byId = new Map(matched.map((r) => [r.foodId, r]));
  for (const f of foods) {
    const r = byId.get(f.foodId);
    if (r?.after !== undefined) f.priceUsdPer100g = r.after;
  }
  fs.writeFileSync(FOODS, JSON.stringify(foods, null, 2) + "\n");

  const lines = [CSV_HEADER.join(",")];
  for (const f of foods) {
    const r = byId.get(f.foodId);
    if (r?.after !== undefined) {
      lines.push([f.foodId, f.name, r.after.toFixed(2), storeName, today, r.note].map(csvField).join(","));
      continue;
    }
    const prev = existingRows.get(f.foodId);
    if (prev) {
      lines.push(CSV_HEADER.map((h) => csvField(prev[h] ?? "")).join(","));
    } else if (f.priceUsdPer100g !== undefined) {
      lines.push(
        [
          f.foodId,
          f.name,
          f.priceUsdPer100g.toFixed(2),
          "ESTIMATE",
          today,
          "curated estimate; no Kroger match",
        ]
          .map(csvField)
          .join(","),
      );
    }
  }
  fs.writeFileSync(PRICES, lines.join("\n") + "\n");
  console.log(`wrote ${path.relative(process.cwd(), FOODS)} and ${path.relative(process.cwd(), PRICES)}`);
  console.log("Next: npm run mocks (regenerates /mocks and /agents/fallbacks from the new prices).");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
