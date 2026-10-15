-- Which channels each on-camera person appears on. On a shoot, a channel's recipes can mix
-- hooks, VOs and CTAs from all the people linked to it (not only one person's own set).
create table public.person_channels (
  person_id uuid not null references public.people (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  primary key (person_id, channel_id)
);
create index person_channels_channel_id_idx on public.person_channels (channel_id);

alter table public.person_channels enable row level security;
revoke all on public.person_channels from anon, authenticated;
grant select, insert, delete on public.person_channels to authenticated;

create policy "allowlisted users can read" on public.person_channels
  for select to authenticated using ((select private.is_allowed()));
create policy "admins can insert" on public.person_channels
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins can delete" on public.person_channels
  for delete to authenticated using ((select private.is_admin()));
