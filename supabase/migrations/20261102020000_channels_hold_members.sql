-- Channels hold their members, and everyone on camera has a login. Adding a member to a channel makes
-- their person record (the shot lists, Dropbox folders and recipes all still hang off people), so
-- Settings no longer needs a People tab. A pending invite can name channels too: they apply when
-- that account signs in. A person with no channels is inactive, so they can't join new shoots.

alter table public.org_invites add column channel_ids uuid[] not null default '{}';
comment on column public.org_invites.channel_ids is 'Channels to join on signing in. Not a foreign key: ones that no longer exist are skipped.';

-- A member's person record in an org, made the first time they need one. The slug goes in folder
-- names, so it never changes once set.
create function private.person_for_member(p_org_id uuid, p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  person uuid;
  person_name text;
  base text;
  candidate text;
  n int := 2;
begin
  select p.id into person from public.people p where p.org_id = p_org_id and p.user_id = p_user_id;
  if person is not null then
    return person;
  end if;
  select coalesce(nullif(trim(m.display_name), ''), nullif(trim(pr.full_name), ''), split_part(pr.email, '@', 1), 'Member')
    into person_name
  from public.org_members m
  join public.profiles pr on pr.id = m.user_id
  where m.org_id = p_org_id and m.user_id = p_user_id;
  if person_name is null then
    raise exception 'That account isn''t a member of this organisation';
  end if;
  base := coalesce(nullif(lower(trim(both '-' from regexp_replace(person_name, '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'member');
  candidate := base;
  while exists (select 1 from public.people p where p.org_id = p_org_id and p.slug = candidate) loop
    candidate := base || '-' || n;
    n := n + 1;
  end loop;
  insert into public.people (org_id, name, slug, user_id) values (p_org_id, person_name, candidate, p_user_id) returning id into person;
  return person;
end $$;

create function private.join_invited_channels(p_org_id uuid, p_user_id uuid, p_channel_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  person uuid;
begin
  if not exists (select 1 from public.channels c where c.org_id = p_org_id and c.id = any (p_channel_ids)) then
    return;
  end if;
  person := private.person_for_member(p_org_id, p_user_id);
  insert into public.person_channels (org_id, person_id, channel_id)
  select p_org_id, person, c.id from public.channels c where c.org_id = p_org_id and c.id = any (p_channel_ids)
  on conflict do nothing;
  update public.people set active = true where id = person and not active;
end $$;

create or replace function private.accept_org_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  invite record;
begin
  if new.email is not null and coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google' then
    for invite in select * from public.org_invites i where i.email = lower(new.email) loop
      insert into public.org_members (org_id, user_id, role, display_name)
      values (invite.org_id, new.id, invite.role, invite.display_name)
      on conflict do nothing;
      perform private.join_invited_channels(invite.org_id, new.id, invite.channel_ids);
    end loop;
    delete from public.org_invites where email = lower(new.email);
  end if;
  return new;
end $$;

create or replace function private.invite_existing_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  existing uuid;
begin
  select u.id into existing from auth.users u
  where lower(u.email) = new.email and coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
  limit 1;
  if existing is null then
    return new;
  end if;
  insert into public.org_members (org_id, user_id, role, display_name)
  values (new.org_id, existing, new.role, new.display_name)
  on conflict do nothing;
  perform private.join_invited_channels(new.org_id, existing, new.channel_ids);
  return null;
end $$;

revoke all on function private.person_for_member(uuid, uuid), private.join_invited_channels(uuid, uuid, uuid[]) from public, anon, authenticated;

-- A channel's members, all at once. Someone taken off their last channel goes inactive; past shoots keep them.
create function public.set_channel_members(p_channel_id uuid, p_user_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  member_id uuid;
begin
  select c.org_id into org from public.channels c where c.id = p_channel_id and c.org_id = private.current_org_id();
  if org is null or not private.is_org_admin(org) then
    raise exception 'Only an admin can change a channel''s members';
  end if;

  delete from public.person_channels pc
  using public.people p
  where pc.channel_id = p_channel_id and p.id = pc.person_id
    and (p.user_id is null or not (p.user_id = any (p_user_ids)));

  foreach member_id in array p_user_ids loop
    insert into public.person_channels (org_id, person_id, channel_id)
    values (org, private.person_for_member(org, member_id), p_channel_id)
    on conflict do nothing;
  end loop;

  update public.people p
  set active = exists (select 1 from public.person_channels pc where pc.person_id = p.id)
  where p.org_id = org
    and p.active is distinct from exists (select 1 from public.person_channels pc where pc.person_id = p.id);
end $$;
revoke all on function public.set_channel_members(uuid, uuid[]) from public, anon;
grant execute on function public.set_channel_members(uuid, uuid[]) to authenticated, service_role;
