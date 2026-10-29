-- How many mixed versions of each VO a shoot's recipes can use (per channel): beats swapped
-- between the people cast on it. 0 = no mixing. broll_variations (already here) is how many
-- b-roll selections each hook + VO + CTA gets, and how many clips each channel films per shot.
alter table public.shoots
  add column vo_variations int not null default 1 check (vo_variations >= 0);
comment on column public.shoots.vo_variations is 'Mixed versions per VO per channel: beats swapped between the people cast on it (0 = none).';
comment on column public.shoots.broll_variations is 'B-roll selections per hook + VO + CTA (each its own recipe), and the clips each channel films per b-roll shot.';

-- People cast on a VO with its writer: they record the same script, beat for beat, so on a
-- channel they share their beats can be swapped. The writer is body_templates.person_id.
create table public.vo_cast (
  body_template_id uuid not null references public.body_templates (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (body_template_id, person_id)
);
create index vo_cast_person_idx on public.vo_cast (person_id);
alter table public.vo_cast enable row level security;
create policy "allowlisted users can read" on public.vo_cast for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.vo_cast for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can delete" on public.vo_cast for delete to authenticated using ((select private.is_allowed()));
create policy "only the writer or an admin casts" on public.vo_cast as restrictive for insert to authenticated with check (private.can_edit_vo(body_template_id));
create policy "only the writer or an admin uncasts" on public.vo_cast as restrictive for delete to authenticated using (private.can_edit_vo(body_template_id));
grant select, insert, delete on public.vo_cast to authenticated;
