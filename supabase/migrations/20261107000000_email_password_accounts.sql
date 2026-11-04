-- Email and password accounts, as well as Google. An invite still only becomes a membership for
-- someone who has proved they own the email: Google accounts always have (Supabase marks them
-- confirmed), email accounts once they've clicked the confirmation link. So the check is the
-- account's confirmed email, not the Google provider, and confirming an email later accepts its
-- invites then. (Supabase's "Confirm email" setting must stay on, or every sign-up counts as
-- confirmed.)

create or replace function private.accept_org_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  invite record;
begin
  if new.email is not null and new.email_confirmed_at is not null then
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

-- run it when an email is confirmed, too
drop trigger z_accept_org_invites on auth.users;
create trigger z_accept_org_invites after insert or update of email, email_confirmed_at, raw_app_meta_data on auth.users
  for each row execute function private.accept_org_invites();

-- Inviting someone who already has a confirmed account adds them straight away
create or replace function private.invite_existing_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  existing uuid;
begin
  select u.id into existing from auth.users u
  where lower(u.email) = new.email and u.email_confirmed_at is not null
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
