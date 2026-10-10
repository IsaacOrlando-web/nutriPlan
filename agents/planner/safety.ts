// Forbidden ingredient detection for planner recipes. Owner: Agents.
// Conservative by design: a food tag excluded by the Doctor (allergies + restrictions) expands to the ingredient
// words that usually carry it, and free text exclusions (allergies, excluded or disliked ingredients) match as whole
// words. A false positive costs one regeneration; a false negative could hurt someone. This is still a text check,
// so the UI reminds people to read labels and that cross-contamination cannot be ruled out.

/** Ingredient words per food tag (the tag vocabulary of foods.json and guidelines.json). */
export const TAG_KEYWORDS: Record<string, string[]> = {
  meat: [
    "beef",
    "pork",
    "chicken",
    "turkey",
    "lamb",
    "bacon",
    "ham",
    "sausage",
    "steak",
    "veal",
    "duck",
    "prosciutto",
    "pancetta",
    "chorizo",
    "pepperoni",
    "salami",
    "meat",
    "carne",
    "pollo",
    "cerdo",
    "res",
  ],
  poultry: ["chicken", "turkey", "duck", "pollo", "pavo"],
  beef: ["beef", "steak", "veal", "brisket", "carne de res", "res"],
  pork: [
    "pork",
    "bacon",
    "ham",
    "sausage",
    "chorizo",
    "prosciutto",
    "pancetta",
    "lard",
    "cerdo",
    "tocino",
    "jamón",
    "jamon",
  ],
  fish: [
    "fish",
    "salmon",
    "tuna",
    "tilapia",
    "cod",
    "sardine",
    "anchovy",
    "anchovies",
    "trout",
    "halibut",
    "mackerel",
    "pescado",
    "atún",
    "atun",
    "salmón",
  ],
  shellfish: [
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "clam",
    "mussel",
    "oyster",
    "scallop",
    "camarón",
    "camaron",
    "camarones",
  ],
  egg: ["egg", "eggs", "mayonnaise", "mayo", "huevo", "huevos"],
  dairy: [
    "milk",
    "cheese",
    "butter",
    "cream",
    "yogurt",
    "yoghurt",
    "ghee",
    "whey",
    "casein",
    "queso",
    "leche",
    "crema",
    "mantequilla",
  ],
  soy: ["soy", "soya", "tofu", "edamame", "tempeh", "miso", "soja"],
  sesame: ["sesame", "tahini", "ajonjolí", "ajonjoli"],
  peanut: ["peanut", "peanuts", "cacahuate", "maní", "mani"],
  nuts: [
    "almond",
    "walnut",
    "pecan",
    "cashew",
    "pistachio",
    "hazelnut",
    "macadamia",
    "nut",
    "nuts",
    "nuez",
    "almendra",
  ],
  gluten: [
    "wheat",
    "flour",
    "bread",
    "pasta",
    "barley",
    "rye",
    "couscous",
    "seitan",
    "breadcrumbs",
    "panko",
    "cracker",
    "spaghetti",
    "noodle",
    "tortilla de harina",
    "harina",
    "pan",
  ],
  honey: ["honey", "miel"],
  legume: ["bean", "beans", "lentil", "chickpea", "pea", "peas", "frijol", "lenteja", "garbanzo"],
  seeds: ["seed", "seeds", "chia", "flax", "pumpkin seed", "sunflower seed"],
  grain: ["rice", "oat", "oats", "quinoa", "wheat", "barley", "corn", "arroz", "avena"],
};

/** Phrases that contain a keyword but not the tag ("coconut milk" is not dairy, "peanut butter" is not dairy). */
const SAFE_PHRASES: Record<string, string[]> = {
  dairy: [
    "coconut milk",
    "almond milk",
    "oat milk",
    "soy milk",
    "rice milk",
    "coconut cream",
    "peanut butter",
    "almond butter",
    "cashew butter",
    "sunflower butter",
    "cocoa butter",
    "cream of tartar",
    "dairy-free",
    "dairy free",
    "vegan cheese",
    "vegan butter",
  ],
  nuts: ["coconut", "nutmeg", "butternut", "water chestnut"],
  egg: ["eggplant", "egg-free", "egg free"],
  gluten: [
    "gluten-free",
    "gluten free",
    "rice noodle",
    "corn tortilla",
    "pan-fry",
    "pan fry",
    "pan-seared",
    "pan seared",
  ],
  meat: ["plant-based", "plant based", "meatless"],
  beef: [],
};

export interface ForbiddenRules {
  /** Food tags from the Doctor's constraints plus planner preferences (lowercase). */
  excludedTags: string[];
  /** Free text terms from allergies, excluded and disliked ingredients (lowercase, trimmed). */
  terms: string[];
}

export interface ForbiddenHit {
  ingredient: string;
  reason: string; // "dairy (milk)" or "peanut"
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole word (or phrase) match with an optional plural, case insensitive, accent aware. */
export function containsWord(text: string, word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  return new RegExp(`(^|[^\\p{L}])${escapeRegExp(w)}(e?s)?($|[^\\p{L}])`, "u").test(text.toLowerCase());
}

/** Normalizes free text exclusions: lowercase, trimmed, underscores to spaces, de-duplicated, empty dropped. */
export function normalizeTerms(terms: string[]): string[] {
  return [
    ...new Set(terms.map((t) => t.trim().toLowerCase().replace(/_/g, " ")).filter((t) => t.length >= 2)),
  ];
}

/** Every forbidden hit among the given texts (ingredient names plus the recipe's declared allergens). */
export function findForbidden(texts: string[], rules: ForbiddenRules): ForbiddenHit[] {
  const hits: ForbiddenHit[] = [];
  for (const original of texts) {
    const text = original.toLowerCase();
    for (const tag of rules.excludedTags) {
      let scrubbed = text;
      for (const safe of SAFE_PHRASES[tag] ?? []) scrubbed = scrubbed.split(safe).join(" ");
      const words = [tag, ...(TAG_KEYWORDS[tag] ?? [])];
      const word = words.find((k) => containsWord(scrubbed, k));
      if (word) hits.push({ ingredient: original, reason: word === tag ? tag : `${tag} (${word})` });
    }
    for (const term of rules.terms) {
      if (containsWord(text, term)) hits.push({ ingredient: original, reason: term });
    }
  }
  return hits;
}
