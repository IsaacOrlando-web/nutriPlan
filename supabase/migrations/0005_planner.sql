-- Weekly meal planner (/plan). Owner: Backend.
-- planner_weeks: one row per user and Monday. `plan` is a WeeklyMealPlan, `state` a PlannerWeekState
-- (completed meals + shopping list edits), both contract JSON from types/contracts.ts.
-- planner_settings: PlannerSettings (preferences, favorite recipes, selected week) in `data`, like the other user tables.
-- The app's server routes use the service role; RLS protects direct client access (own rows only).

create table if not exists planner_weeks (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  plan jsonb,
  state jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create table if not exists planner_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table planner_weeks enable row level security;
alter table planner_settings enable row level security;

create policy "planner weeks own select" on planner_weeks for select using (auth.uid() = user_id);
create policy "planner weeks own insert" on planner_weeks for insert with check (auth.uid() = user_id);
create policy "planner weeks own update" on planner_weeks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "planner weeks own delete" on planner_weeks for delete using (auth.uid() = user_id);

create policy "planner settings own select" on planner_settings for select using (auth.uid() = user_id);
create policy "planner settings own insert" on planner_settings for insert with check (auth.uid() = user_id);
create policy "planner settings own update" on planner_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "planner settings own delete" on planner_settings for delete using (auth.uid() = user_id);
