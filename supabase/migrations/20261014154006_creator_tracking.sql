-- Who created what, and when.
-- 1. profiles: auth user id -> email / name, kept in sync from auth.users, so created_by can be shown.
-- 2. stamp_creator: created_by / created_at are set by the database on insert and can never be changed.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create policy "allowlisted users can read" on public.profiles
  for select to authenticated using ((select private.is_allowed()));

-- Runs as the function owner so it can write profiles on behalf of the auth service.
create function private.sync_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();
  return new;
end $$;

create trigger sync_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.sync_profile();

insert into public.profiles (id, email, full_name, avatar_url)
select id, lower(email),
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

create function private.stamp_creator() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- the signed-in user, whatever the client sent; migrations and service jobs keep their value
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'allowed_users', 'settings', 'people', 'channels', 'angles', 'brands', 'products', 'formats',
    'body_templates', 'hook_templates', 'cta_templates', 'shoots', 'shoot_items', 'broll_shots'
  ] loop
    execute format(
      'create trigger stamp_creator before insert or update on public.%I for each row execute function private.stamp_creator()', t
    );
  end loop;
end $$;

revoke all on function private.sync_profile(), private.stamp_creator() from public, anon;
grant execute on function private.stamp_creator() to authenticated, service_role;
