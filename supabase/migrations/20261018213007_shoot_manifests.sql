-- The shoot's manifest (spec §14): an index of every clip in edited/ (who, what, which
-- channel and beat, its script, file names and length, b-roll shot details) written when the
-- shoot is marked ready for batching, and again whenever it's refreshed. The same JSON goes to
-- manifest.json in the shoot folder for tools; batches read the latest version from here and
-- record which version they used.
create table public.shoot_manifests (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  version int not null check (version > 0),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (shoot_id, version)
);

create index shoot_manifests_created_by_idx on public.shoot_manifests (created_by);

create trigger set_updated_at before update on public.shoot_manifests
  for each row execute function private.set_updated_at();
create trigger stamp_creator before insert or update on public.shoot_manifests
  for each row execute function private.stamp_creator();

alter table public.shoot_manifests enable row level security;
revoke all on public.shoot_manifests from anon, authenticated;
grant select, insert on public.shoot_manifests to authenticated;

create policy "allowlisted users can read" on public.shoot_manifests
  for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.shoot_manifests
  for insert to authenticated with check ((select private.is_allowed()));

-- batches record the manifest they were built from
alter table public.shoot_shortlists add column manifest_version int;
