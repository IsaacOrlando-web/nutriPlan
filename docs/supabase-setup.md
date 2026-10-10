# Connecting to the team Supabase project

The app runs with zero setup on a local JSON store (`DATA_BACKEND=memory`). Switching to the shared
Supabase project gives everyone the same data, real auth and photo storage. Owner: Lead (one time) and
Backend (schema changes).

## 1. Lead: apply the schema and seed (once)

1. Dashboard -> project -> **Settings -> API**. Copy the Project URL, the `anon` key and the `service_role` key.
2. In the repo root:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>   # the id in the project URL
   npx supabase db push                           # applies supabase/migrations/0001_init.sql and 0002_rls.sql
   ```

3. Seed the demo users and food database: dashboard -> **SQL Editor** -> paste `supabase/seed.sql` -> **Run**.
   This creates:
   - `alex@demo.nutriplan.app` and `maria@demo.nutriplan.app`, password `demo1234`, with their fixed user ids
   - 21 days of readings each (Alex weight stall, Maria glucose drift), relative to today
   - 75 foods and 64 meal templates
   - the public `photos` storage bucket (created by the migration)

4. Create `.env.local` (git ignored) from `.env.example`:

   ```
   DATA_BACKEND=supabase
   AUTH_MODE=supabase
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```

5. Share `.env.local` with the team through a private channel. Never commit it: the service role key
   bypasses row level security.

## 2. Everyone: use it

1. `git pull`
2. Put the shared `.env.local` in the repo root
3. `npm run setup` (first time) then `npm run dev`
4. Open http://localhost:3000 and sign in as `alex@demo.nutriplan.app` / `demo1234`

`npm run doctor` prints which backend and auth mode the app will use. No `.env.local` means the
local memory store, which is fine for frontend work.

## 3. Changing the schema (Backend role)

1. Add a new file `supabase/migrations/000N_<name>.sql`. Never edit an applied migration.
2. Test locally: `npm run db:start` (needs Docker Desktop running) then `npm run db:reset`.
3. `npx supabase db push` to apply to the shared project, then tell the team in the group chat.
4. If a table shape changes, update `lib/db/supabase-store.ts` and `lib/db/memory-store.ts` together.

## 4. Reset the demo users on the shared project

In the app: Profile -> "Reset demo data" (calls `POST /api/demo/reset`), or run the readings part of
`supabase/seed.sql` again in the SQL Editor.

## Troubleshooting

- `relation "foods" does not exist`: migrations not pushed; run `npx supabase db push`.
- `401 Not signed in` on every API call: `AUTH_MODE=supabase` but the browser has no Supabase session;
  sign in through the login page (local cookie logins only work with `AUTH_MODE=local`).
- `search_foods` errors: the function is created by `0001_init.sql`; re-push migrations.
- Photos fail to upload: check the `photos` bucket exists and is public in Storage.
