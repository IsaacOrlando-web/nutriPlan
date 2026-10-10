-- Kroger connection per user: OAuth tokens plus the chosen store. Owner: Backend.
-- Row shape matches lib/kroger/types.ts KrogerConnection, kept as JSON in `data` like the other user tables.
-- The app's server routes use the service role; RLS protects direct client access (own rows only).

create table if not exists kroger_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table kroger_connections enable row level security;

create policy "kroger own select" on kroger_connections for select using (auth.uid() = user_id);
create policy "kroger own insert" on kroger_connections for insert with check (auth.uid() = user_id);
create policy "kroger own update" on kroger_connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kroger own delete" on kroger_connections for delete using (auth.uid() = user_id);
