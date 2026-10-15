-- Formats added to a shoot's plan by hand (for b-roll planning). Formats used by the shoot's
-- VOs are always included as well, so they don't need a row here.
create table public.shoot_formats (
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  format_id uuid not null references public.formats (id) on delete restrict,
  primary key (shoot_id, format_id)
);
create index shoot_formats_format_id_idx on public.shoot_formats (format_id);

alter table public.shoot_formats enable row level security;
revoke all on public.shoot_formats from anon, authenticated;
grant select, insert, delete on public.shoot_formats to authenticated;

create policy "allowlisted users can read" on public.shoot_formats
  for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.shoot_formats
  for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can delete from draft shoots" on public.shoot_formats
  for delete to authenticated using ((select private.is_allowed()) and private.shoot_is_draft(shoot_id));
