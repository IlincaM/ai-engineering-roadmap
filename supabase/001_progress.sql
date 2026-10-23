-- Already applied to the Supabase project; retained here for version control.
create table if not exists public.roadmap_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null check (length(item_key) between 1 and 100),
  item_value jsonb not null check (jsonb_typeof(item_value) = 'object' and item_value ? 'v'),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
create or replace function public.set_roadmap_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
drop trigger if exists trg_roadmap_updated_at on public.roadmap_progress;
create trigger trg_roadmap_updated_at before update on public.roadmap_progress
for each row execute function public.set_roadmap_updated_at();
alter table public.roadmap_progress enable row level security;
revoke all on table public.roadmap_progress from anon;
grant select, insert, update, delete on public.roadmap_progress to authenticated;
drop policy if exists roadmap_owner_select on public.roadmap_progress;
create policy roadmap_owner_select on public.roadmap_progress for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists roadmap_owner_insert on public.roadmap_progress;
create policy roadmap_owner_insert on public.roadmap_progress for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists roadmap_owner_update on public.roadmap_progress;
create policy roadmap_owner_update on public.roadmap_progress for update to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists roadmap_owner_delete on public.roadmap_progress;
create policy roadmap_owner_delete on public.roadmap_progress for delete to authenticated using (user_id = (select auth.uid()));
