-- Clips added on set, one row per deliverable that has footage (a shoot item, or one required
-- clip of a b-roll shot for one channel). The clip itself stays on the phone that added it
-- until it's uploaded; this row tells every other phone it's taken, so nobody films it twice.

create table public.shoot_clips (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  -- clipTarget.item() / clipTarget.broll() in the app, e.g. "item:<id>" or "broll:<shot>:<channel>:0"
  target text not null,
  file_name text not null,
  size bigint not null check (size >= 0),
  state text not null default 'saved' check (state in ('saved', 'uploaded')),
  -- where it landed in Dropbox, once uploaded
  path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- who added it (and so whose phone it's on)
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (shoot_id, target)
);

create index shoot_clips_created_by_idx on public.shoot_clips (created_by);

create trigger set_updated_at before update on public.shoot_clips
  for each row execute function private.set_updated_at();
create trigger stamp_creator before insert or update on public.shoot_clips
  for each row execute function private.stamp_creator();

alter table public.shoot_clips enable row level security;
revoke all on public.shoot_clips from anon, authenticated;
grant select, insert, update, delete on public.shoot_clips to authenticated;

create policy "allowlisted users can read" on public.shoot_clips
  for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.shoot_clips
  for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can update" on public.shoot_clips
  for update to authenticated using ((select private.is_allowed())) with check ((select private.is_allowed()));
create policy "allowlisted users can delete" on public.shoot_clips
  for delete to authenticated using ((select private.is_allowed()));

-- Live on every phone on set; deletes carry the whole row so the target can be cleared.
alter table public.shoot_clips replica identity full;
alter publication supabase_realtime add table public.shoot_clips;
