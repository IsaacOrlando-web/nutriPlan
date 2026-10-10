// Imports extra common foods from USDA FoodData Central into scripts/data/foods.json. Owner: Backend.
// Curated entries already in foods.json are never overwritten (same foodId or same name).
//   USDA_API_KEY=... npm run data:usda              merges new foods into foods.json
//   USDA_API_KEY=... npm run data:usda -- --dry-run  prints what would be added
//   --limit N                                        only the first N search terms (quick test)
// Get a free key at https://fdc.nal.usda.gov/api-key-signup.html
import fs from "node:fs";
import path from "node:path";
import type { Food, Nutrients } from "@/types/contracts";
import { applyGlycemicIndex } from "./add-glycemic-index";

const ROOT = path.resolve(__dirname, "../..");
const FOODS = path.join(ROOT, "scripts/data/foods.json");
const API = "https://api.nal.usda.gov/fdc/v1";

/** USDA nutrient ids -> Nutrients keys (per 100 g). */
const NUTRIENT_IDS: Record<keyof Nutrients, number[]> = {
  calories: [1008, 2047, 2048],
  proteinG: [1003],
  carbsG: [1005, 1050],
  fatG: [1004],
  fiberG: [1079],
  sugarG: [2000, 1063],
  addedSugarG: [1235],
  satFatG: [1258],
  sodiumMg: [1093],
  potassiumMg: [1092],
};

type Section = Food["storeSection"];

interface Term {
  id: string;
  query: string;
  section: Section;
  tags: string[];
  servingG: number;
  servingLabel: string;
  nameEs?: string;
}

const t = (
  id: string,
  query: string,
  section: Section,
  tags: string[],
  servingG: number,
  servingLabel: string,
  nameEs?: string,
): Term => ({
  id,
  query,
  section,
  tags,
  servingG,
  servingLabel,
  nameEs,
});

const MEAT = ["meat"];
const POULTRY = ["meat", "poultry"];
const FISH = ["fish"];
const SHELL = ["fish", "shellfish"];
const DAIRY = ["dairy", "vegetarian"];
const VEG = ["vegetable", "vegan", "vegetarian"];
const FRUIT = ["fruit", "vegan", "vegetarian"];
const GRAIN = ["grain", "vegan", "vegetarian"];
const GLUTEN = ["grain", "gluten", "vegan", "vegetarian"];
const LEGUME = ["legume", "vegan", "vegetarian"];
const NUTS = ["nuts", "vegan", "vegetarian"];
const SEEDS = ["seeds", "vegan", "vegetarian"];

/** About 150 everyday foods, phrased the way FoodData Central (SR Legacy / Foundation) names them. */
export const CURATED_TERMS: Term[] = [
  // protein
  t(
    "chicken_drumstick",
    "Chicken, broilers or fryers, drumstick, meat only, cooked, roasted",
    "protein",
    POULTRY,
    90,
    "1 drumstick",
    "Muslo de pollo",
  ),
  t(
    "chicken_wings",
    "Chicken, broilers or fryers, wing, meat and skin, cooked, roasted",
    "protein",
    POULTRY,
    85,
    "3 wings",
    "Alitas de pollo",
  ),
  t(
    "ground_chicken",
    "Chicken, ground, crumbles, cooked, pan-browned",
    "protein",
    POULTRY,
    85,
    "3 oz cooked",
    "Pollo molido",
  ),
  t(
    "turkey_breast",
    "Turkey, breast, meat only, cooked, roasted",
    "protein",
    POULTRY,
    85,
    "3 oz",
    "Pechuga de pavo",
  ),
  t(
    "deli_turkey",
    "Turkey breast, sliced, prepackaged",
    "protein",
    POULTRY,
    56,
    "2 slices",
    "Pavo en lonchas",
  ),
  t(
    "sirloin_steak",
    'Beef, top sirloin, steak, separable lean only, trimmed to 0" fat, choice, cooked, broiled',
    "protein",
    MEAT,
    85,
    "3 oz",
    "Bistec de lomo",
  ),
  t(
    "beef_chuck_roast",
    'Beef, chuck, arm pot roast, separable lean only, trimmed to 0" fat, choice, cooked, braised',
    "protein",
    MEAT,
    85,
    "3 oz",
    "Carne de res estofada",
  ),
  t(
    "ground_beef_85",
    "Beef, ground, 85% lean meat / 15% fat, patty, cooked, pan-broiled",
    "protein",
    MEAT,
    85,
    "1 patty",
    "Carne molida 85%",
  ),
  t(
    "pork_chop",
    "Pork, fresh, loin, center loin (chops), bone-in, separable lean only, cooked, broiled",
    "protein",
    ["meat", "pork"],
    85,
    "1 chop",
    "Chuleta de cerdo",
  ),
  t(
    "pork_tenderloin",
    "Pork, fresh, loin, tenderloin, separable lean only, cooked, roasted",
    "protein",
    ["meat", "pork"],
    85,
    "3 oz",
    "Lomo de cerdo",
  ),
  t(
    "ham",
    "Ham, sliced, regular (approximately 11% fat)",
    "protein",
    ["meat", "pork"],
    56,
    "2 slices",
    "Jamón",
  ),
  t("bacon", "Pork, cured, bacon, cooked, pan-fried", "protein", ["meat", "pork"], 16, "2 slices", "Tocino"),
  t(
    "lamb_leg",
    'Lamb, domestic, leg, whole (shank and sirloin), separable lean only, trimmed to 1/4" fat, choice, cooked, roasted',
    "protein",
    MEAT,
    85,
    "3 oz",
    "Pierna de cordero",
  ),
  t("cod", "Fish, cod, Atlantic, cooked, dry heat", "protein", FISH, 85, "3 oz", "Bacalao"),
  t(
    "halibut",
    "Fish, halibut, Atlantic and Pacific, cooked, dry heat",
    "protein",
    FISH,
    85,
    "3 oz",
    "Halibut",
  ),
  t("trout", "Fish, trout, rainbow, farmed, cooked, dry heat", "protein", FISH, 85, "3 oz", "Trucha"),
  t("mackerel", "Fish, mackerel, Atlantic, cooked, dry heat", "protein", FISH, 85, "3 oz", "Caballa"),
  t(
    "canned_salmon",
    "Fish, salmon, pink, canned, drained solids",
    "protein",
    FISH,
    85,
    "3 oz",
    "Salmón enlatado",
  ),
  t("smoked_salmon", "Fish, salmon, chinook, smoked", "protein", FISH, 56, "2 oz", "Salmón ahumado"),
  t("crab", "Crustaceans, crab, blue, cooked, moist heat", "protein", SHELL, 85, "3 oz", "Cangrejo"),
  t("scallops", "Mollusks, scallop, mixed species, cooked, steamed", "protein", SHELL, 85, "3 oz", "Vieiras"),
  t("mussels", "Mollusks, mussel, blue, cooked, moist heat", "protein", SHELL, 85, "3 oz", "Mejillones"),
  t("tempeh", "Tempeh", "protein", ["soy", "vegan", "vegetarian"], 84, "3 oz", "Tempeh"),
  t("seitan", "Seitan", "protein", ["gluten", "vegan", "vegetarian"], 85, "3 oz", "Seitán"),
  t(
    "veggie_burger",
    "Veggie burgers or soyburgers, unprepared",
    "frozen",
    ["soy", "vegetarian"],
    70,
    "1 patty",
    "Hamburguesa vegetal",
  ),
  // legumes
  t(
    "kidney_beans",
    "Beans, kidney, red, mature seeds, cooked, boiled, without salt",
    "pantry",
    LEGUME,
    90,
    "1/2 cup cooked",
    "Frijoles rojos",
  ),
  t(
    "navy_beans",
    "Beans, navy, mature seeds, cooked, boiled, without salt",
    "pantry",
    LEGUME,
    91,
    "1/2 cup cooked",
    "Frijoles blancos",
  ),
  t(
    "white_beans",
    "Beans, white, mature seeds, cooked, boiled, without salt",
    "pantry",
    LEGUME,
    90,
    "1/2 cup cooked",
    "Alubias blancas",
  ),
  t(
    "refried_beans",
    "Beans, pinto, mature seeds, canned, refried",
    "pantry",
    LEGUME,
    120,
    "1/2 cup",
    "Frijoles refritos",
  ),
  t(
    "split_peas",
    "Peas, split, mature seeds, cooked, boiled, without salt",
    "pantry",
    LEGUME,
    98,
    "1/2 cup cooked",
    "Guisantes partidos",
  ),
  t(
    "green_peas",
    "Peas, green, frozen, cooked, boiled, drained, without salt",
    "frozen",
    [...LEGUME, "vegetable"],
    80,
    "1/2 cup",
    "Guisantes",
  ),
  t(
    "soy_milk",
    "Soymilk, original and vanilla, unfortified",
    "dairy",
    ["soy", "vegan", "vegetarian"],
    240,
    "1 cup",
    "Leche de soya",
  ),
  // dairy and eggs
  t(
    "skim_milk",
    "Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)",
    "dairy",
    DAIRY,
    244,
    "1 cup",
    "Leche descremada",
  ),
  t(
    "whole_milk",
    "Milk, whole, 3.25% milkfat, with added vitamin D",
    "dairy",
    DAIRY,
    244,
    "1 cup",
    "Leche entera",
  ),
  t("plain_yogurt", "Yogurt, plain, low fat", "dairy", DAIRY, 170, "3/4 cup", "Yogur natural"),
  t("kefir", "Kefir, lowfat, plain, LIFEWAY", "dairy", DAIRY, 240, "1 cup", "Kéfir"),
  t("mozzarella", "Cheese, mozzarella, part skim milk", "dairy", DAIRY, 28, "1 oz", "Mozzarella"),
  t("feta", "Cheese, feta", "dairy", DAIRY, 28, "1 oz", "Queso feta"),
  t("parmesan", "Cheese, parmesan, grated", "dairy", DAIRY, 10, "2 tbsp", "Parmesano"),
  t("swiss_cheese", "Cheese, swiss", "dairy", DAIRY, 28, "1 slice", "Queso suizo"),
  t("cream_cheese", "Cheese, cream", "dairy", DAIRY, 30, "2 tbsp", "Queso crema"),
  t("ricotta", "Cheese, ricotta, part skim milk", "dairy", DAIRY, 62, "1/4 cup", "Ricotta"),
  t("butter", "Butter, salted", "dairy", DAIRY, 14, "1 tbsp", "Mantequilla"),
  t("sour_cream", "Cream, sour, cultured", "dairy", DAIRY, 30, "2 tbsp", "Crema agria"),
  t("queso_fresco", "Cheese, mexican, queso fresco", "dairy", DAIRY, 28, "1 oz", "Queso fresco"),
  // grains and starches
  t(
    "basmati_rice",
    "Rice, white, long-grain, regular, enriched, cooked",
    "grains",
    GRAIN,
    158,
    "1 cup cooked",
    "Arroz basmati",
  ),
  t("wild_rice", "Wild rice, cooked", "grains", GRAIN, 82, "1/2 cup cooked", "Arroz salvaje"),
  t("barley", "Barley, pearled, cooked", "grains", GLUTEN, 79, "1/2 cup cooked", "Cebada"),
  t("bulgur", "Bulgur, cooked", "grains", GLUTEN, 91, "1/2 cup cooked", "Bulgur"),
  t("couscous", "Couscous, cooked", "grains", GLUTEN, 79, "1/2 cup cooked", "Cuscús"),
  t("farro", "Farro, cooked", "grains", GLUTEN, 85, "1/2 cup cooked", "Farro"),
  t("millet", "Millet, cooked", "grains", GRAIN, 87, "1/2 cup cooked", "Mijo"),
  t(
    "buckwheat",
    "Buckwheat groats, roasted, cooked",
    "grains",
    GRAIN,
    84,
    "1/2 cup cooked",
    "Trigo sarraceno",
  ),
  t("white_bread", "Bread, white, commercially prepared", "grains", GLUTEN, 28, "1 slice", "Pan blanco"),
  t(
    "sourdough",
    "Bread, french or vienna (includes sourdough)",
    "grains",
    GLUTEN,
    32,
    "1 slice",
    "Pan de masa madre",
  ),
  t("rye_bread", "Bread, rye", "grains", GLUTEN, 32, "1 slice", "Pan de centeno"),
  t(
    "bagel",
    "Bagels, plain, enriched, with calcium propionate (includes onion, poppy, sesame)",
    "grains",
    GLUTEN,
    89,
    "1 bagel",
    "Bagel",
  ),
  t("english_muffin", "English muffins, whole-wheat", "grains", GLUTEN, 66, "1 muffin", "Muffin inglés"),
  t(
    "ww_tortilla",
    "Tortillas, ready-to-bake or -fry, whole wheat",
    "grains",
    GLUTEN,
    45,
    "1 tortilla",
    "Tortilla integral",
  ),
  t("pasta", "Pasta, cooked, enriched, without added salt", "grains", GLUTEN, 140, "1 cup cooked", "Pasta"),
  t(
    "egg_noodles",
    "Noodles, egg, cooked, enriched",
    "grains",
    [...GLUTEN, "egg"],
    160,
    "1 cup cooked",
    "Fideos de huevo",
  ),
  t("rice_noodles", "Rice noodles, cooked", "grains", GRAIN, 176, "1 cup cooked", "Fideos de arroz"),
  t("soba", "Noodles, japanese, soba, cooked", "grains", GLUTEN, 114, "1 cup cooked", "Soba"),
  t(
    "granola",
    "Cereals ready-to-eat, granola, homemade",
    "pantry",
    [...GLUTEN, "nuts"],
    61,
    "1/2 cup",
    "Granola",
  ),
  t(
    "cornflakes",
    "Cereals ready-to-eat, KELLOGG, KELLOGG'S Corn Flakes",
    "pantry",
    GRAIN,
    28,
    "1 cup",
    "Hojuelas de maíz",
  ),
  t(
    "shredded_wheat",
    "Cereals ready-to-eat, wheat, shredded, plain, sugar and salt free",
    "pantry",
    GLUTEN,
    47,
    "2 biscuits",
    "Trigo triturado",
  ),
  t("rice_cakes", "Rice cakes, brown rice, plain", "pantry", GRAIN, 9, "1 cake", "Tortitas de arroz"),
  t("crackers_ww", "Crackers, whole-wheat", "pantry", GLUTEN, 28, "6 crackers", "Galletas integrales"),
  t("pretzels", "Snacks, pretzels, hard, plain, salted", "pantry", GLUTEN, 28, "1 oz", "Pretzels"),
  t(
    "tortilla_chips",
    "Snacks, tortilla chips, plain, white corn, salted",
    "pantry",
    GRAIN,
    28,
    "1 oz",
    "Totopos",
  ),
  t("red_potato", "Potatoes, red, flesh and skin, baked", "produce", VEG, 173, "1 medium", "Papa roja"),
  t(
    "yam",
    "Yam, cooked, boiled, drained, or baked, without salt",
    "produce",
    VEG,
    136,
    "1 cup cubed",
    "Ñame",
  ),
  t(
    "butternut_squash",
    "Squash, winter, butternut, cooked, baked, without salt",
    "produce",
    VEG,
    205,
    "1 cup cubed",
    "Calabaza butternut",
  ),
  t(
    "corn_on_cob",
    "Corn, sweet, yellow, cooked, boiled, drained, without salt",
    "produce",
    VEG,
    103,
    "1 ear",
    "Elote",
  ),
  // vegetables
  t("kale", "Kale, cooked, boiled, drained, without salt", "produce", VEG, 118, "1 cup cooked", "Col rizada"),
  t("romaine", "Lettuce, cos or romaine, raw", "produce", VEG, 47, "1 cup shredded", "Lechuga romana"),
  t("arugula", "Arugula, raw", "produce", VEG, 20, "1 cup", "Rúcula"),
  t(
    "cauliflower",
    "Cauliflower, cooked, boiled, drained, without salt",
    "produce",
    VEG,
    124,
    "1 cup",
    "Coliflor",
  ),
  t(
    "brussels_sprouts",
    "Brussels sprouts, cooked, boiled, drained, without salt",
    "produce",
    VEG,
    156,
    "1 cup",
    "Coles de Bruselas",
  ),
  t("asparagus", "Asparagus, cooked, boiled, drained", "produce", VEG, 90, "6 spears", "Espárragos"),
  t("celery", "Celery, raw", "produce", VEG, 40, "1 stalk", "Apio"),
  t("eggplant", "Eggplant, cooked, boiled, drained, without salt", "produce", VEG, 99, "1 cup", "Berenjena"),
  t("beets", "Beets, cooked, boiled, drained", "produce", VEG, 85, "1/2 cup", "Remolacha"),
  t("radish", "Radishes, raw", "produce", VEG, 58, "1/2 cup sliced", "Rábano"),
  t(
    "sweet_corn_kernels",
    "Corn, sweet, yellow, frozen, kernels cut off cob, boiled, drained, without salt",
    "frozen",
    VEG,
    82,
    "1/2 cup",
    "Granos de elote",
  ),
  t(
    "snap_peas",
    "Peas, edible-podded, cooked, boiled, drained, without salt",
    "produce",
    VEG,
    80,
    "1/2 cup",
    "Guisantes dulces",
  ),
  t(
    "bok_choy",
    "Cabbage, chinese (pak-choi), cooked, boiled, drained, without salt",
    "produce",
    VEG,
    170,
    "1 cup",
    "Bok choy",
  ),
  t(
    "leek",
    "Leeks, (bulb and lower leaf-portion), cooked, boiled, drained, without salt",
    "produce",
    VEG,
    124,
    "1 leek",
    "Puerro",
  ),
  t("garlic", "Garlic, raw", "produce", VEG, 3, "1 clove", "Ajo"),
  t("ginger", "Ginger root, raw", "produce", VEG, 5, "1 tsp grated", "Jengibre"),
  t("jalapeno", "Peppers, jalapeno, raw", "produce", VEG, 14, "1 pepper", "Jalapeño"),
  t("poblano", "Peppers, hot chili, green, raw", "produce", VEG, 45, "1 pepper", "Chile poblano"),
  t("tomatillo", "Tomatillos, raw", "produce", VEG, 34, "1 medium", "Tomatillo"),
  t(
    "chayote",
    "Chayote, fruit, cooked, boiled, drained, without salt",
    "produce",
    VEG,
    160,
    "1 cup",
    "Chayote",
  ),
  t("jicama", "Yambean (jicama), raw", "produce", VEG, 120, "1 cup sliced", "Jícama"),
  t("cilantro", "Coriander (cilantro) leaves, raw", "produce", VEG, 4, "1/4 cup", "Cilantro"),
  t("lime", "Limes, raw", "produce", FRUIT, 67, "1 lime", "Limón verde"),
  t("lemon", "Lemons, raw, without peel", "produce", FRUIT, 58, "1 lemon", "Limón amarillo"),
  t(
    "frozen_spinach",
    "Spinach, frozen, chopped or leaf, cooked, boiled, drained, without salt",
    "frozen",
    VEG,
    95,
    "1/2 cup",
    "Espinaca congelada",
  ),
  t(
    "frozen_broccoli",
    "Broccoli, frozen, chopped, cooked, boiled, drained, without salt",
    "frozen",
    VEG,
    92,
    "1/2 cup",
    "Brócoli congelado",
  ),
  t("sauerkraut", "Sauerkraut, canned, solids and liquids", "pantry", VEG, 71, "1/2 cup", "Chucrut"),
  t("pickles", "Pickles, cucumber, dill or kosher dill", "pantry", VEG, 35, "1 spear", "Pepinillos"),
  t("olives", "Olives, ripe, canned (small-extra large)", "pantry", VEG, 15, "5 olives", "Aceitunas"),
  // fruit
  t(
    "grapes",
    "Grapes, red or green (European type, such as Thompson seedless), raw",
    "produce",
    FRUIT,
    92,
    "1 cup",
    "Uvas",
  ),
  t("pear", "Pears, raw", "produce", FRUIT, 178, "1 medium", "Pera"),
  t("peach", "Peaches, yellow, raw", "produce", FRUIT, 150, "1 medium", "Durazno"),
  t("plum", "Plums, raw", "produce", FRUIT, 66, "1 plum", "Ciruela"),
  t("cherries", "Cherries, sweet, raw", "produce", FRUIT, 138, "1 cup", "Cerezas"),
  t("watermelon", "Watermelon, raw", "produce", FRUIT, 152, "1 cup diced", "Sandía"),
  t("cantaloupe", "Melons, cantaloupe, raw", "produce", FRUIT, 160, "1 cup diced", "Melón"),
  t("pineapple", "Pineapple, raw, all varieties", "produce", FRUIT, 165, "1 cup chunks", "Piña"),
  t("grapefruit", "Grapefruit, raw, pink and red, all areas", "produce", FRUIT, 123, "1/2 fruit", "Toronja"),
  t("clementine", "Clementines, raw", "produce", FRUIT, 74, "1 fruit", "Clementina"),
  t("raspberries", "Raspberries, raw", "produce", FRUIT, 123, "1 cup", "Frambuesas"),
  t("blackberries", "Blackberries, raw", "produce", FRUIT, 144, "1 cup", "Moras"),
  t("pomegranate", "Pomegranates, raw", "produce", FRUIT, 87, "1/2 cup arils", "Granada"),
  t("guava", "Guavas, common, raw", "produce", FRUIT, 55, "1 fruit", "Guayaba"),
  t("dates", "Dates, medjool", "pantry", FRUIT, 24, "1 date", "Dátiles"),
  t("raisins", "Raisins, dark, seedless", "pantry", FRUIT, 28, "small box", "Pasas"),
  t("dried_apricots", "Apricots, dried, sulfured, uncooked", "pantry", FRUIT, 35, "5 halves", "Orejones"),
  t(
    "applesauce",
    "Applesauce, canned, unsweetened, without added ascorbic acid",
    "pantry",
    FRUIT,
    122,
    "1/2 cup",
    "Puré de manzana",
  ),
  t(
    "frozen_berries",
    "Blueberries, frozen, unsweetened",
    "frozen",
    FRUIT,
    155,
    "1 cup",
    "Frutos rojos congelados",
  ),
  t("orange_juice", "Orange juice, raw", "dairy", FRUIT, 248, "1 cup", "Jugo de naranja"),
  // nuts, seeds, fats
  t("cashews", "Nuts, cashew nuts, dry roasted, without salt added", "pantry", NUTS, 28, "1 oz", "Anacardos"),
  t(
    "pistachios",
    "Nuts, pistachio nuts, dry roasted, without salt added",
    "pantry",
    NUTS,
    28,
    "1 oz",
    "Pistachos",
  ),
  t("pecans", "Nuts, pecans", "pantry", NUTS, 28, "1 oz", "Nueces pecanas"),
  t("hazelnuts", "Nuts, hazelnuts or filberts", "pantry", NUTS, 28, "1 oz", "Avellanas"),
  t(
    "almond_butter",
    "Nuts, almond butter, plain, without salt added",
    "pantry",
    NUTS,
    32,
    "2 tbsp",
    "Mantequilla de almendra",
  ),
  t(
    "sunflower_seeds",
    "Seeds, sunflower seed kernels, dry roasted, without salt",
    "pantry",
    SEEDS,
    28,
    "1 oz",
    "Semillas de girasol",
  ),
  t("flaxseed", "Seeds, flaxseed", "pantry", SEEDS, 10, "1 tbsp", "Linaza"),
  t("hemp_seeds", "Seeds, hemp seed, hulled", "pantry", SEEDS, 30, "3 tbsp", "Semillas de cáñamo"),
  t("sesame_seeds", "Seeds, sesame seeds, whole, dried", "pantry", SEEDS, 9, "1 tbsp", "Ajonjolí"),
  t(
    "tahini",
    "Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type)",
    "pantry",
    SEEDS,
    15,
    "1 tbsp",
    "Tahini",
  ),
  t("canola_oil", "Oil, canola", "pantry", ["vegan", "vegetarian"], 14, "1 tbsp", "Aceite de canola"),
  t("coconut_oil", "Oil, coconut", "pantry", ["vegan", "vegetarian"], 14, "1 tbsp", "Aceite de coco"),
  t(
    "mayonnaise",
    "Salad dressing, mayonnaise, regular",
    "pantry",
    ["egg", "vegetarian"],
    14,
    "1 tbsp",
    "Mayonesa",
  ),
  t(
    "coconut_milk",
    "Nuts, coconut milk, canned (liquid expressed from grated meat and water)",
    "pantry",
    ["vegan", "vegetarian"],
    60,
    "1/4 cup",
    "Leche de coco",
  ),
  // pantry and condiments
  t("tomato_sauce", "Tomato products, canned, sauce", "pantry", VEG, 122, "1/2 cup", "Salsa de tomate"),
  t(
    "tomato_paste",
    "Tomato products, canned, paste, without salt added",
    "pantry",
    VEG,
    16,
    "1 tbsp",
    "Pasta de tomate",
  ),
  t(
    "marinara",
    "Sauce, pasta, spaghetti/marinara, ready-to-serve",
    "pantry",
    VEG,
    125,
    "1/2 cup",
    "Salsa marinara",
  ),
  t(
    "chicken_broth",
    "Soup, chicken broth, canned, condensed",
    "pantry",
    POULTRY,
    240,
    "1 cup",
    "Caldo de pollo",
  ),
  t(
    "vegetable_broth",
    "Soup, vegetable broth, ready to serve",
    "pantry",
    VEG,
    240,
    "1 cup",
    "Caldo de verduras",
  ),
  t(
    "peanut_sauce",
    "Sauce, peanut, ready-to-serve",
    "pantry",
    ["peanut", "vegetarian"],
    30,
    "2 tbsp",
    "Salsa de maní",
  ),
  t("ketchup", "Catsup", "pantry", ["vegan", "vegetarian"], 17, "1 tbsp", "Kétchup"),
  t("mustard", "Mustard, prepared, yellow", "pantry", ["vegan", "vegetarian"], 5, "1 tsp", "Mostaza"),
  t(
    "hot_sauce",
    "Sauce, ready-to-serve, pepper or hot",
    "pantry",
    ["vegan", "vegetarian"],
    5,
    "1 tsp",
    "Salsa picante",
  ),
  t(
    "balsamic_vinegar",
    "Vinegar, balsamic",
    "pantry",
    ["vegan", "vegetarian"],
    16,
    "1 tbsp",
    "Vinagre balsámico",
  ),
  t("maple_syrup", "Syrups, maple", "pantry", ["vegan", "vegetarian"], 20, "1 tbsp", "Jarabe de arce"),
  t("jam", "Jams and preserves", "pantry", ["vegan", "vegetarian"], 20, "1 tbsp", "Mermelada"),
  t(
    "dark_chocolate",
    "Chocolate, dark, 70-85% cacao solids",
    "pantry",
    ["vegetarian"],
    28,
    "1 oz",
    "Chocolate oscuro",
  ),
  t(
    "cocoa_powder",
    "Cocoa, dry powder, unsweetened",
    "pantry",
    ["vegan", "vegetarian"],
    5,
    "1 tbsp",
    "Cacao en polvo",
  ),
  t(
    "protein_powder_whey",
    "Beverages, Protein powder whey based",
    "pantry",
    ["dairy", "vegetarian"],
    30,
    "1 scoop",
    "Proteína de suero",
  ),
  t(
    "coffee",
    "Beverages, coffee, brewed, prepared with tap water",
    "pantry",
    ["vegan", "vegetarian"],
    240,
    "1 cup",
    "Café",
  ),
  t(
    "green_tea",
    "Beverages, tea, green, brewed, regular",
    "pantry",
    ["vegan", "vegetarian"],
    240,
    "1 cup",
    "Té verde",
  ),
  t(
    "almond_milk",
    "Beverages, almond milk, unsweetened, shelf stable",
    "dairy",
    ["nuts", "vegan", "vegetarian"],
    240,
    "1 cup",
    "Leche de almendra",
  ),
  t(
    "oat_milk",
    "Beverages, oat milk, unsweetened",
    "dairy",
    ["vegan", "vegetarian"],
    240,
    "1 cup",
    "Leche de avena",
  ),
];

interface FdcNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  value?: number;
  amount?: number;
  nutrient?: { id: number };
}
interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: FdcNutrient[];
}

function nutrientValue(list: FdcNutrient[], ids: number[]): number | undefined {
  for (const id of ids) {
    const hit = list.find((n) => (n.nutrientId ?? n.nutrient?.id) === id);
    const v = hit?.value ?? hit?.amount;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

export function mapNutrients(list: FdcNutrient[]): Nutrients | null {
  const n: Partial<Nutrients> = {};
  for (const key of Object.keys(NUTRIENT_IDS) as (keyof Nutrients)[]) {
    const v = nutrientValue(list, NUTRIENT_IDS[key]);
    n[key] = v === undefined ? 0 : Math.round(v * 100) / 100;
  }
  const out = n as Nutrients;
  if (out.calories === 0 && out.proteinG === 0 && out.carbsG === 0 && out.fatG === 0) return null;
  if (out.calories === 0) out.calories = Math.round(out.proteinG * 4 + out.carbsG * 4 + out.fatG * 9);
  return out;
}

/** Prefers Foundation and SR Legacy records, then whichever description is closest to the query. */
function pickBest(query: string, foods: FdcFood[]): FdcFood | null {
  const rank = (f: FdcFood) =>
    f.dataType === "Foundation"
      ? 0
      : f.dataType === "SR Legacy"
        ? 1
        : f.dataType === "Survey (FNDDS)"
          ? 2
          : 3;
  const q = query.toLowerCase();
  const scored = foods
    .filter((f) => f.foodNutrients?.length)
    .map((f) => {
      const d = f.description.toLowerCase();
      const exact = d === q ? 0 : d.startsWith(q.split(",")[0]) ? 1 : 2;
      return { f, score: rank(f) * 10 + exact };
    })
    .sort((a, b) => a.score - b.score);
  return scored[0]?.f ?? null;
}

async function searchFdc(apiKey: string, query: string): Promise<FdcFood[]> {
  const res = await fetch(`${API}/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"], pageSize: 8 }),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 4000));
    return searchFdc(apiKey, query);
  }
  if (!res.ok) throw new Error(`FDC ${res.status} for "${query}"`);
  const data = (await res.json()) as { foods?: FdcFood[] };
  return data.foods ?? [];
}

function toFood(term: Term, fdc: FdcFood, per100g: Nutrients): Food {
  const name = term.query.split(",").slice(0, 2).join(",").trim();
  return {
    foodId: term.id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    ...(term.nameEs ? { nameEs: term.nameEs } : {}),
    per100g,
    giEstimated: true,
    servingG: term.servingG,
    servingLabel: term.servingLabel,
    tags: [...new Set(term.tags)],
    storeSection: term.section,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : CURATED_TERMS.length;
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error("USDA_API_KEY is required (free at https://fdc.nal.usda.gov/api-key-signup.html)");
    process.exit(1);
  }

  const existing = JSON.parse(fs.readFileSync(FOODS, "utf8")) as Food[];
  const byId = new Set(existing.map((f) => f.foodId));
  const byName = new Set(existing.map((f) => f.name.toLowerCase()));
  const added: Food[] = [];
  const skipped: string[] = [];

  for (const term of CURATED_TERMS.slice(0, limit)) {
    if (byId.has(term.id)) {
      skipped.push(`${term.id} (curated)`);
      continue;
    }
    try {
      const results = await searchFdc(apiKey, term.query);
      const best = pickBest(term.query, results);
      const per100g = best ? mapNutrients(best.foodNutrients) : null;
      if (!best || !per100g) {
        skipped.push(`${term.id} (no FDC match)`);
        continue;
      }
      const food = toFood(term, best, per100g);
      if (byName.has(food.name.toLowerCase())) {
        skipped.push(`${term.id} (name exists)`);
        continue;
      }
      added.push(food);
      console.log(
        `+ ${food.foodId}  <- FDC ${best.fdcId} ${best.dataType}: ${best.description} (${per100g.calories} kcal/100g)`,
      );
      await new Promise((r) => setTimeout(r, 250)); // stay well under the FDC rate limit
    } catch (err) {
      skipped.push(`${term.id} (${(err as Error).message})`);
    }
  }

  applyGlycemicIndex(added);
  console.log(`\n${added.length} new foods, ${skipped.length} skipped`);
  if (skipped.length) console.log(skipped.map((s) => `  - ${s}`).join("\n"));
  if (dryRun || added.length === 0) return;
  const merged = [...existing, ...added];
  fs.writeFileSync(FOODS, JSON.stringify(merged, null, 2) + "\n");
  console.log(
    `wrote ${path.relative(process.cwd(), FOODS)} (${merged.length} foods). Next: npm run data:prices (add rows to prices.csv first).`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
