# Kroger integration

Real shelf prices for the grocery list and "Send to Kroger cart", through the Kroger Public API
(https://developer.kroger.com). Owner: Backend. Code: `lib/kroger/**`, `app/api/kroger/**`,
`scripts/data/kroger-prices.ts`, `supabase/migrations/0003_kroger.sql`.

Everything degrades cleanly without credentials: `GET /api/kroger/status` answers `{ configured: false }` and
every other Kroger route answers `{ error, code: "kroger_not_configured" }` (HTTP 503). The app, the agents and
the curated prices in `scripts/data/prices.csv` keep working.

## 1. Register the app (5 minutes)

1. Sign in at https://developer.kroger.com (a normal Kroger shopper account works) and open **My Apps**.
2. **Create app**. Name it `NutriPlan AI`. Pick the **Public** API family and request these scopes:
   - `product.compact` (product and location search)
   - `cart.basic:write` (add items to the shopper's cart)
   - `profile.compact` (needed by the OAuth consent screen)
3. Redirect URIs (one per line; Kroger matches them exactly, including the path):
   - `http://localhost:3000/api/kroger/callback`
   - `https://<your-production-host>/api/kroger/callback`
4. Copy the **Client ID** and **Client Secret** (the secret is shown once; regenerate it in the portal if lost).
5. Approval of the public scopes is immediate for a sandbox-level app. The rate limit is **10,000 calls per
   day per endpoint family**; this integration caches product lookups for an hour, so a demo day uses a few hundred.

## 2. Environment

Copy the block from `.env.example` into `.env.local`:

| Variable               | Required for            | Notes                                                                                             |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `KROGER_CLIENT_ID`     | everything              | from the portal                                                                                   |
| `KROGER_CLIENT_SECRET` | everything              | secret, server only, never commit                                                                 |
| `KROGER_REDIRECT_URI`  | "Connect Kroger" (cart) | must equal one of the registered URIs, e.g. `http://localhost:3000/api/kroger/callback`           |
| `KROGER_LOCATION_ID`   | optional                | default store when the user has not picked one; also used by the price script                     |
| `KROGER_STATE_SECRET`  | optional                | HMAC key for the OAuth `state`; falls back to `SUPABASE_SERVICE_ROLE_KEY`, then the client secret |
| `KROGER_API_BASE`      | optional                | default `https://api.kroger.com/v1`; point it at a mock server for offline demos                  |

Restart `npm run dev` after editing `.env.local`. With `DATA_BACKEND=supabase`, apply
`supabase/migrations/0003_kroger.sql` (`npm run db:reset` locally or the Supabase SQL editor).

## 3. Price the food catalog from one real store (done on 2026-10-10 for Kroger On the Rhine, 45202; rerun to refresh)

Satisfies the spec requirement "prices from one real store with the date collected".

```bash
npx tsx scripts/data/kroger-prices.ts --zip 45202 --dry-run   # table only: before / after / product / size / shelf price
npx tsx scripts/data/kroger-prices.ts --zip 45202             # writes foods.json + prices.csv
KROGER_LOCATION_ID=01400943 npx tsx scripts/data/kroger-prices.ts
npm run mocks                                  # regenerate /mocks and /agents/fallbacks from the new prices
```

- `--zip` picks the first Kroger-family store near the zip; `KROGER_LOCATION_ID` uses a known store.
- `prices.csv` rows get `store=<store name>`, `date_collected=<today>` and
  `source_note="Kroger API <productId> <size> $<price>"`.
- A food with no confident match keeps its curated price and its previous csv row; nothing is overwritten blindly.
- Matching (`lib/kroger/match.ts`): the food name becomes a short query ("Chicken breast, roasted" -> "chicken
  breast"), candidates are ranked by token overlap with a penalty for processed forms (nuggets, soup, chips...),
  and the package size ("2 lb", "32 fl oz", "12 ct") is converted to grams to get a price per 100 g.
  Counts use the food's serving size (12 ct eggs = 12 x 50 g).

## 4. Demo flow (grocery screen)

1. **Connect Kroger** -> `GET /api/kroger/connect` redirects to Kroger's consent page (scopes `cart.basic:write
profile.compact`) with a signed `state`; the nonce also lives in an httpOnly cookie. Kroger sends the browser
   to `/api/kroger/callback`, which verifies the state, exchanges the code and redirects to
   `/grocery?kroger=connected` (or `?kroger=error&reason=<code>`).
2. **Pick a store** -> `GET /api/kroger/locations?zip=45202` then `POST /api/kroger/location { locationId, name, zip }`.
   The pick is saved even before OAuth (a connection shell without tokens).
3. **Price with Kroger** -> `POST /api/kroger/price` prices the current plan's grocery list at that store:
   `{ items: PricedGroceryItem[], totalUsd, matched, unmatched }` where `items[i].kroger` carries the product,
   package size, unit price, `packagesNeeded` (ceil(quantityG / packageGrams)) and `lineUsd`.
4. **Send to cart** -> `POST /api/kroger/cart` (empty body) adds every matched item with `packagesNeeded` as the
   quantity, modality PICKUP; returns `{ added, skipped }`. The user access token is refreshed automatically when
   it has expired (tokens last 30 minutes, refresh tokens 6 months). Then open https://www.kroger.com/cart.
5. **Disconnect** -> `DELETE /api/kroger/connect` drops the tokens and keeps the chosen store.

Route summary:

| Route                            | Auth          | Returns                                                                         |
| -------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| `GET /api/kroger/status`         | session       | `{ configured, connected, location: { id, name } \| null }`                     |
| `GET /api/kroger/locations?zip=` | session       | `{ locations: [{ id, name, address }] }` (app token)                            |
| `POST /api/kroger/location`      | session       | KrogerStatus                                                                    |
| `GET /api/kroger/connect`        | session       | 302 to Kroger (JSON error for non-browser callers)                              |
| `GET /api/kroger/callback`       | state         | 302 to `/grocery?kroger=connected` or `?kroger=error&reason=`                   |
| `DELETE /api/kroger/connect`     | session       | KrogerStatus                                                                    |
| `POST /api/kroger/price`         | session       | `{ items, totalUsd, matched, unmatched }`                                       |
| `POST /api/kroger/cart`          | session+OAuth | `{ added, skipped }`; optional body `{ items: [{ upc, quantity }], modality? }` |

Error codes (`{ error, code }`): `kroger_not_configured` (503), `kroger_not_connected` (401),
`kroger_no_location` (400), `kroger_auth_failed` (401), `kroger_timeout` (504), `kroger_upstream` (502 / 429),
`kroger_bad_state` (callback redirect only).

## 5. What works without credentials

- Status route, store pick (`POST /api/kroger/location`), curated prices, every other screen.
- Unit tests (`npx vitest run lib`) run against a fake Kroger behind `fetch`; nothing needs the network.
- Not available: store search, live pricing, OAuth connect, cart. The grocery screen should hide or disable
  "Send to Kroger cart" when `status.configured` is false, and show "Connect Kroger" when `connected` is false.

## 6. Verifying with curl

```bash
curl -c c.txt -X POST -H "Content-Type: application/json" -d '{"identifier":"alex"}' http://localhost:3000/api/auth/login
curl -b c.txt http://localhost:3000/api/kroger/status
curl -b c.txt "http://localhost:3000/api/kroger/locations?zip=45202"
curl -b c.txt -X POST http://localhost:3000/api/kroger/price
```
