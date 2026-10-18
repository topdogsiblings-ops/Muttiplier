-- Shortlists (spec §14). Once editors have mirrored raw/ into edited/, a shoot is marked ready
-- for shortlist (status `edited`). Each shortlist is a set of recipes chosen from every
-- possible combination; the first spreads evenly, later ones skip every recipe already
-- shortlisted and lean on how the hooks, VOs and CTAs were rated.

-- How a filmed hook, VO or CTA did: good ones are favoured in later shortlists, bad ones left out.
alter table public.shoot_items add column rating text check (rating in ('good', 'bad'));

create table public.shoot_shortlists (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  -- SL01, SL02… within the shoot; also the name of its file and its renders/ folder
  code text not null,
  size int not null check (size > 0),
  -- the recipe ids it holds, so later shortlists can skip them
  recipe_ids text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (shoot_id, code)
);

create index shoot_shortlists_created_by_idx on public.shoot_shortlists (created_by);

create trigger set_updated_at before update on public.shoot_shortlists
  for each row execute function private.set_updated_at();
create trigger stamp_creator before insert or update on public.shoot_shortlists
  for each row execute function private.stamp_creator();

alter table public.shoot_shortlists enable row level security;
revoke all on public.shoot_shortlists from anon, authenticated;
grant select, insert on public.shoot_shortlists to authenticated;

create policy "allowlisted users can read" on public.shoot_shortlists
  for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.shoot_shortlists
  for insert to authenticated with check ((select private.is_allowed()));
