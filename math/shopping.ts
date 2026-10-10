// Shopping list aggregation for the weekly planner. Owner: Math. Pure functions, no I/O.
// Repeated ingredients are combined only when their units are compatible (mass with mass, volume with volume,
// identical count units); anything else stays on its own line. User edits (checks, quantity overrides, removals,
// custom items) are applied on top by item key, so recipe changes never wipe the state of unaffected items.
import type { Recipe, ShoppingCustomItem, ShoppingState } from "@/types/contracts";
import { normalizeUnit, toBaseQuantity, unitFamily, type UnitFamily } from "./recipe-units";

export interface ShoppingListItem {
  /** Stable key: normalized name + unit family (+ unit for counts), or `custom:<id>`. */
  key: string;
  name: string;
  category: string;
  quantity: number | null;
  unit: string;
  /** Recipe titles that use this item. */
  sources: string[];
  custom: boolean;
}

export interface ShoppingListView {
  items: (ShoppingListItem & { checked: boolean; quantityLabel: string })[];
  purchased: number;
  remaining: number;
}

const CATEGORY_ORDER = ["produce", "protein", "dairy", "grains", "pantry", "spices", "frozen", "other"];

export function normalizeCategory(category: string): string {
  const c = category.trim().toLowerCase();
  if (CATEGORY_ORDER.includes(c)) return c;
  if (/meat|fish|seafood|poultry|egg|tofu|legume|bean/.test(c)) return "protein";
  if (/vegetable|fruit|herb/.test(c)) return "produce";
  if (/cheese|milk|yogurt/.test(c)) return "dairy";
  if (/bread|rice|pasta|cereal|grain|bakery/.test(c)) return "grains";
  if (/spice|season/.test(c)) return "spices";
  if (/oil|sauce|condiment|can|baking|nut|seed/.test(c)) return "pantry";
  return "other";
}

/** Lowercase, trimmed, simple English singular ("Tomatoes" -> "tomato", "eggs" -> "egg"). */
export function normalizeIngredientName(name: string): string {
  let n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.endsWith("oes")) n = n.slice(0, -2);
  else if (n.endsWith("ies") && n.length > 4) n = `${n.slice(0, -3)}y`;
  else if (n.endsWith("s") && !/(ss|us|is)$/.test(n) && n.length > 3) n = n.slice(0, -1);
  return n;
}

function familyKey(family: UnitFamily, unit: string): string {
  return family === "count" ? `count:${normalizeUnit(unit)}` : family;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Aggregates every ingredient of the given recipes into shopping items. */
export function aggregateShopping(recipes: Recipe[]): ShoppingListItem[] {
  interface Acc {
    item: ShoppingListItem;
    family: UnitFamily;
    units: Set<string>;
    base: number; // g or ml for mass/volume, raw quantity for counts
  }
  const byKey = new Map<string, Acc>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const name = normalizeIngredientName(ing.name);
      if (!name) continue;
      const family = unitFamily(ing.unit, ing.quantity);
      const key = `${name}|${familyKey(family, ing.unit)}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = {
          item: {
            key,
            name: ing.name.trim(),
            category: normalizeCategory(ing.category),
            quantity: null,
            unit: family === "unspecified" ? "" : normalizeUnit(ing.unit),
            sources: [],
            custom: false,
          },
          family,
          units: new Set(),
          base: 0,
        };
        byKey.set(key, acc);
      }
      if (!acc.item.sources.includes(recipe.title)) acc.item.sources.push(recipe.title);
      if (family === "unspecified" || ing.quantity === null) continue;
      acc.units.add(normalizeUnit(ing.unit));
      if (family === "count") acc.base += ing.quantity;
      else acc.base += toBaseQuantity(ing.quantity, ing.unit)!.value;
    }
  }
  const out: ShoppingListItem[] = [];
  for (const acc of byKey.values()) {
    const { item, family, units } = acc;
    if (family === "unspecified") out.push(item);
    else if (family === "count") out.push({ ...item, quantity: round2(acc.base) });
    else if (units.size === 1) {
      // One unit used everywhere: keep the cook's unit ("3 cups", not "720 ml").
      const unit = [...units][0];
      const perUnit = toBaseQuantity(1, unit)!.value;
      out.push({ ...item, unit, quantity: round2(acc.base / perUnit) });
    } else if (family === "mass") {
      out.push(
        acc.base >= 1000
          ? { ...item, unit: "kg", quantity: round2(acc.base / 1000) }
          : { ...item, unit: "g", quantity: Math.round(acc.base) },
      );
    } else {
      out.push(
        acc.base >= 1000
          ? { ...item, unit: "l", quantity: round2(acc.base / 1000) }
          : { ...item, unit: "ml", quantity: Math.round(acc.base) },
      );
    }
  }
  return sortShopping(out);
}

export function sortShopping<T extends { category: string; name: string }>(items: T[]): T[] {
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  return [...items].sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
}

export function formatQuantity(quantity: number | null, unit: string): string {
  if (quantity === null) return unit ? unit : "as needed";
  const q = Number.isInteger(quantity) ? String(quantity) : String(round2(quantity));
  return unit ? `${q} ${unit}` : q;
}

export function customItemToShopping(c: ShoppingCustomItem): ShoppingListItem {
  return {
    key: `custom:${c.id}`,
    name: c.name,
    category: normalizeCategory(c.category),
    quantity: c.quantity,
    unit: c.unit,
    sources: [],
    custom: true,
  };
}

/** Applies user edits to aggregated items and counts purchased vs remaining lines. */
export function applyShoppingState(items: ShoppingListItem[], state: ShoppingState): ShoppingListView {
  const removed = new Set(state.removed);
  const all = sortShopping([
    ...items.filter((i) => !removed.has(i.key)),
    ...state.customItems.map(customItemToShopping),
  ]);
  const view = all.map((i) => ({
    ...i,
    checked: Boolean(state.checked[i.key]),
    quantityLabel: state.quantityOverrides[i.key] ?? formatQuantity(i.quantity, i.unit),
  }));
  const purchased = view.filter((i) => i.checked).length;
  return { items: view, purchased, remaining: view.length - purchased };
}

/** Groups items by category in store order. */
export function groupByCategory<T extends { category: string }>(
  items: T[],
): { category: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const i of items) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ra = CATEGORY_ORDER.indexOf(a);
      const rb = CATEGORY_ORDER.indexOf(b);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    })
    .map(([category, list]) => ({ category, items: list }));
}

/** Drops state for keys no longer in the list (except custom items), keeping everything still relevant. */
export function pruneShoppingState(items: ShoppingListItem[], state: ShoppingState): ShoppingState {
  const keys = new Set([...items.map((i) => i.key), ...state.customItems.map((c) => `custom:${c.id}`)]);
  const keep = <V>(rec: Record<string, V>) =>
    Object.fromEntries(Object.entries(rec).filter(([k]) => keys.has(k)));
  return {
    checked: keep(state.checked),
    quantityOverrides: keep(state.quantityOverrides),
    removed: state.removed.filter((k) => keys.has(k)),
    customItems: state.customItems,
  };
}

export function emptyShoppingState(): ShoppingState {
  return { checked: {}, quantityOverrides: {}, removed: [], customItems: [] };
}
