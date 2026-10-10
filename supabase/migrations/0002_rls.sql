-- Row level security. Owner: Backend.
-- Users see only their own rows. Foods and templates are readable by anyone signed in.
-- agent_logs has no policies: only the service role (lib/db SupabaseStore) can touch it.
-- The app's server routes use the service role key, which bypasses RLS; these policies protect direct
-- client access (Supabase Realtime on agent_events, the browser client).

alter table profiles enable row level security;
alter table medical_constraints enable row level security;
alter table daily_targets enable row level security;
alter table tdee_posteriors enable row level security;
alter table foods enable row level security;
alter table meal_templates enable row level security;
alter table meal_plans enable row level security;
alter table food_logs enable row level security;
alter table readings enable row level security;
alter table meal_ratings enable row level security;
alter table agent_runs enable row level security;
alter table agent_events enable row level security;
alter table agent_logs enable row level security;

-- own rows: select / insert / update
create policy "profiles own select" on profiles for select using (auth.uid() = user_id);
create policy "profiles own insert" on profiles for insert with check (auth.uid() = user_id);
create policy "profiles own update" on profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "constraints own select" on medical_constraints for select using (auth.uid() = user_id);
create policy "constraints own insert" on medical_constraints for insert with check (auth.uid() = user_id);
create policy "constraints own update" on medical_constraints for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "targets own select" on daily_targets for select using (auth.uid() = user_id);
create policy "targets own insert" on daily_targets for insert with check (auth.uid() = user_id);
create policy "targets own update" on daily_targets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tdee own select" on tdee_posteriors for select using (auth.uid() = user_id);
create policy "tdee own insert" on tdee_posteriors for insert with check (auth.uid() = user_id);
create policy "tdee own update" on tdee_posteriors for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "plans own select" on meal_plans for select using (auth.uid() = user_id);
create policy "plans own insert" on meal_plans for insert with check (auth.uid() = user_id);
create policy "plans own update" on meal_plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "logs own select" on food_logs for select using (auth.uid() = user_id);
create policy "logs own insert" on food_logs for insert with check (auth.uid() = user_id);
create policy "logs own update" on food_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "readings own select" on readings for select using (auth.uid() = user_id);
create policy "readings own insert" on readings for insert with check (auth.uid() = user_id);
create policy "readings own update" on readings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ratings own select" on meal_ratings for select using (auth.uid() = user_id);
create policy "ratings own insert" on meal_ratings for insert with check (auth.uid() = user_id);
create policy "ratings own update" on meal_ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "runs own select" on agent_runs for select using (auth.uid() = user_id);
create policy "runs own insert" on agent_runs for insert with check (auth.uid() = user_id);
create policy "runs own update" on agent_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- shared reference data
create policy "foods read" on foods for select to authenticated using (true);
create policy "templates read" on meal_templates for select to authenticated using (true);

-- agent events: readable when the run belongs to the user (Realtime honours this policy)
create policy "events of own runs" on agent_events for select using (
  exists (select 1 from agent_runs r where r.run_id = agent_events.run_id and r.user_id = auth.uid())
);

-- storage: anyone can read meal photos (public bucket), signed in users upload under their own folder
create policy "photos public read" on storage.objects for select using (bucket_id = 'photos');
create policy "photos own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
