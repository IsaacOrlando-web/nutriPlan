// Kroger integration types. Owner: Backend.
// Response shapes were promoted to /types/contracts.ts (D-013) and are re-exported here so existing
// imports keep working. Only the persisted connection and raw Kroger API shapes stay local.
export type {
  KrogerCartItemInput,
  KrogerCartResponse,
  KrogerLocation,
  KrogerPriceResponse,
  KrogerStatus,
  PricedGroceryItem,
} from "@/types/contracts";

/** What we persist per user (store.getKrogerConnection). Tokens are optional: picking a store creates a shell. */
export interface KrogerConnection {
  accessToken?: string;
  refreshToken?: string;
  /** ISO timestamp when accessToken stops working (Kroger tokens live 30 minutes). */
  expiresAt?: string;
  locationId?: string;
  locationName?: string;
  zip?: string;
}

export interface KrogerTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
}

export interface KrogerPrice {
  regular?: number;
  promo?: number;
}

export interface KrogerProduct {
  productId: string;
  upc: string;
  description: string;
  brand?: string;
  /** Shelf size label as Kroger returns it: "16 oz", "1 lb", "12 ct", "1 gal", "32 fl oz". */
  size?: string;
  price?: KrogerPrice;
  inStore?: boolean;
  imageUrl?: string;
}

export interface KrogerMatch {
  product: KrogerProduct;
  /** 0..1 token overlap between the food name and the product description. */
  score: number;
  /** Shelf price (promo when present) per 100 g of the package contents. */
  pricePer100g: number;
  /** Grams in one package, derived from the size label. */
  packageGrams: number;
  /** Price actually used for the computation (promo ?? regular). */
  unitPriceUsd: number;
}
