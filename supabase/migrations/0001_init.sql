-- NutriPlan AI schema (spec sections 8 and 12). Owner: Backend.
-- Row shapes match lib/db/supabase-store.ts: user tables keep the contract JSON in `data`.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- profile bundle
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists medical_constraints (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists daily_targets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists tdee_posteriors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- foods and templates (shared)
create table if not exists foods (
  food_id text primary key,
  name text not null,
  name_es text,
  data jsonb not null,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists foods_name_trgm on foods using gin (name gin_trgm_ops);
create index if not exists foods_name_es_trgm on foods using gin (name_es gin_trgm_ops);
create index if not exists foods_tags_idx on foods using gin (tags);

create table if not exists meal_templates (
  template_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- plans
create table if not exists meal_plans (
  plan_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version int not null default 1,
  is_current boolean not null default true,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists meal_plans_user_current on meal_plans (user_id, is_current, created_at desc);

-- ---------------------------------------------------------------- logs and readings
create table if not exists food_logs (
  log_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  eaten_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists food_logs_user_eaten on food_logs (user_id, eaten_at);

create table if not exists readings (
  reading_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('weight', 'glucose_fasting', 'glucose_post_meal', 'bp')),
  value numeric not null,
  value2 numeric,
  unit text not null,
  taken_at timestamptz not null default now(),
  related_log_id uuid
);
create index if not exists readings_user_type_taken on readings (user_id, type, taken_at);

create table if not exists meal_ratings (
  rating_id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_name text not null,
  liked boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists meal_ratings_user on meal_ratings (user_id);

-- ---------------------------------------------------------------- agent runs, events, logs
create table if not exists agent_runs (
  run_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trigger text not null,
  reason text,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists agent_runs_user_created on agent_runs (user_id, created_at desc);

create table if not exists agent_events (
  event_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs (run_id) on delete cascade,
  agent text not null,
  kind text not null,
  text text not null,
  data jsonb,
  at timestamptz not null default now()
);
create index if not exists agent_events_run_at on agent_events (run_id, at);

-- Realtime: the frontend may subscribe to agent_events for the live negotiation feed.
alter publication supabase_realtime add table agent_events;

create table if not exists agent_logs (
  id bigserial primary key,
  run_id uuid,
  agent text not null,
  model text not null,
  input jsonb,
  output jsonb,
  ms int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- fuzzy food search
-- Mirrors MemoryStore.searchFoods: trigram similarity on name / name_es, excluding any food that carries
-- one of the excluded tags (allergies and restrictions). An empty query lists foods alphabetically.
create or replace function search_foods(q text, max_results int default 20, excluded_tags text[] default '{}')
returns setof foods
language sql
stable
as $$
  select f.*
  from foods f
  where not (f.tags && coalesce(excluded_tags, '{}'))
    and (
      coalesce(trim(q), '') = ''
      or f.name ilike '%' || trim(q) || '%'
      or f.name_es ilike '%' || trim(q) || '%'
      or similarity(f.name, q) > 0.2
      or similarity(coalesce(f.name_es, ''), q) > 0.2
    )
  order by
    case when coalesce(trim(q), '') = '' then 0 else 1 end,
    greatest(similarity(f.name, coalesce(q, '')), similarity(coalesce(f.name_es, ''), coalesce(q, ''))) desc,
    f.name asc
  limit greatest(coalesce(max_results, 20), 1);
$$;

-- ---------------------------------------------------------------- storage bucket for meal photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public;
