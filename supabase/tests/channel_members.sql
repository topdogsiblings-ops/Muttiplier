-- Channels hold their members: adding one makes their person record, taking someone off their last
-- channel makes them inactive, only admins can do it, and invites carry channels through to sign-in.
-- Raises on the first failure, and rolls everything back either way.
-- Run it in the Supabase SQL editor, or with psql against the project.

begin;

do $$
declare
  org uuid := (select id from public.orgs where slug = 'topdogugc');
  admin_user uuid := (select user_id from public.org_members where org_id = (select id from public.orgs where slug = 'topdogugc') and role = 'admin' limit 1);
  member_user uuid := (select user_id from public.org_members where org_id = (select id from public.orgs where slug = 'topdogugc') and role = 'member' limit 1);
  a_channel uuid := (select id from public.channels where org_id = (select id from public.orgs where slug = 'topdogugc') order by name limit 1);
  before_ids uuid[];
  invited uuid := gen_random_uuid();
  the_person uuid;
  slug_before text;
  be_admin text := json_build_object('sub', admin_user, 'role', 'authenticated')::text;
  be_member text := json_build_object('sub', member_user, 'role', 'authenticated')::text;
begin
  select coalesce(array_agg(p.user_id), '{}') into before_ids
  from public.person_channels pc join public.people p on p.id = pc.person_id
  where pc.channel_id = a_channel and p.user_id is not null;

  -- a fresh member with no person record yet
  insert into auth.users (id, email, aud, role, raw_app_meta_data)
  values (invited, 'channel-test@example.com', 'authenticated', 'authenticated', '{"providers":["google"]}');
  insert into public.org_members (org_id, user_id, role, display_name) values (org, invited, 'member', 'Test Person');

  perform set_config('role', 'authenticated', true);

  -- a member can't change a channel
  perform set_config('request.jwt.claims', be_member, true);
  begin
    perform public.set_channel_members(a_channel, array[member_user]);
    raise exception 'FAILED: a member changed a channel''s members';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;

  -- an admin adds them: they get a person record, linked and active
  perform set_config('request.jwt.claims', be_admin, true);
  perform public.set_channel_members(a_channel, before_ids || invited);
  select p.id, p.slug into the_person, slug_before from public.people p where p.org_id = org and p.user_id = invited;
  if the_person is null then raise exception 'FAILED: no person record made'; end if;
  if slug_before <> 'test-person' then raise exception 'FAILED: unexpected slug %', slug_before; end if;
  if not exists (select 1 from public.person_channels where person_channels.person_id = the_person and channel_id = a_channel) then
    raise exception 'FAILED: not added to the channel';
  end if;

  -- adding again changes nothing
  perform public.set_channel_members(a_channel, before_ids || invited);
  if (select count(*) from public.people where org_id = org and user_id = invited) <> 1 then
    raise exception 'FAILED: a second person record was made';
  end if;

  -- taken off their last channel: inactive, record and slug kept
  perform public.set_channel_members(a_channel, before_ids);
  if (select active from public.people where id = the_person) then raise exception 'FAILED: still active with no channels'; end if;
  if (select slug from public.people where id = the_person) <> slug_before then raise exception 'FAILED: the slug changed'; end if;

  -- back on: active again, same record
  perform public.set_channel_members(a_channel, before_ids || invited);
  if not (select active from public.people where id = the_person) then raise exception 'FAILED: not active again'; end if;
  if (select count(*) from public.people where org_id = org and user_id = invited) <> 1 then
    raise exception 'FAILED: a new record instead of the old one';
  end if;

  -- everyone who was on the channel still is
  if exists (
    select 1 from unnest(before_ids) u
    where not exists (select 1 from public.person_channels pc join public.people p on p.id = pc.person_id where pc.channel_id = a_channel and p.user_id = u)
  ) then
    raise exception 'FAILED: someone was dropped from the channel';
  end if;

  -- an invite carries its channels through to sign-in
  insert into public.org_invites (email, role, display_name, channel_ids) values ('channel-invite@example.com', 'member', 'Invite Person', array[a_channel]);
  perform set_config('role', 'postgres', true);
  invited := gen_random_uuid();
  insert into auth.users (id, email, aud, role, raw_app_meta_data)
  values (invited, 'channel-invite@example.com', 'authenticated', 'authenticated', '{"providers":["google"]}');
  if not exists (
    select 1 from public.person_channels pc join public.people p on p.id = pc.person_id
    where p.user_id = invited and pc.channel_id = a_channel
  ) then
    raise exception 'FAILED: the invite''s channels weren''t applied at sign-in';
  end if;
  if exists (select 1 from public.org_invites where email = 'channel-invite@example.com') then
    raise exception 'FAILED: the invite is still pending';
  end if;

  raise notice 'channel members: all checks passed';
end $$;

rollback;
