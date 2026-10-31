-- The batch loop: a Live shoot's batches each go batched -> rendering -> submitted -> measured.
-- Measuring a batch (scoring every element it used) opens the next; picks learn from the scores:
-- exploit what won, explore what's untried, drop what keeps losing.
alter table public.shoot_shortlists
  add column status text not null default 'batched' check (status in ('batched', 'rendering', 'submitted', 'measured')),
  add column status_at timestamptz not null default now(),
  -- the share picked to exploit what's won (the rest explores), when it was picked
  add column exploit_share numeric;
comment on column public.shoot_shortlists.status is 'batched (picked) -> rendering (Showdog) -> submitted (to the brand) -> measured (every element scored).';

alter table public.shoots
  add column exploit_share numeric not null default 0.7 check (exploit_share >= 0 and exploit_share <= 1);
comment on column public.shoots.exploit_share is 'Share of each new batch picked to exploit elements that have won; the rest explores untried ones.';

-- One score per element a batch used: a hook, VO, CTA (their templates), a format (code), a
-- hook type, a treatment (name) or a person.
create table public.batch_scores (
  shortlist_id uuid not null references public.shoot_shortlists (id) on delete cascade,
  element_kind text not null check (element_kind in ('hook', 'vo', 'cta', 'format', 'hook_type', 'treatment', 'person')),
  element_key text not null,
  score text not null check (score in ('winner', 'mid', 'loser')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (shortlist_id, element_kind, element_key)
);
alter table public.batch_scores enable row level security;
create policy "allowlisted users can read" on public.batch_scores for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.batch_scores for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can update" on public.batch_scores for update to authenticated using ((select private.is_allowed())) with check ((select private.is_allowed()));
create policy "allowlisted users can delete" on public.batch_scores for delete to authenticated using ((select private.is_allowed()));
grant select, insert, update, delete on public.batch_scores to authenticated;

-- An element dropped (or un-dropped) by hand, overriding the automatic rule (2+ losers, no wins).
create table public.shoot_element_overrides (
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  element_kind text not null check (element_kind in ('hook', 'vo', 'cta', 'format', 'hook_type', 'treatment', 'person')),
  element_key text not null,
  dropped boolean not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (shoot_id, element_kind, element_key)
);
alter table public.shoot_element_overrides enable row level security;
create policy "allowlisted users can read" on public.shoot_element_overrides for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.shoot_element_overrides for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can update" on public.shoot_element_overrides for update to authenticated using ((select private.is_allowed())) with check ((select private.is_allowed()));
create policy "allowlisted users can delete" on public.shoot_element_overrides for delete to authenticated using ((select private.is_allowed()));
grant select, insert, update, delete on public.shoot_element_overrides to authenticated;
