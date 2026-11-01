-- Multi-org: an org owns everything in the app, and people belong to orgs through org_members.
-- The org pays and its admins invite members, who don't pay. This supersedes allowed_users (kept
-- until the app that reads it is gone). Someone who hasn't signed in yet can't be a member, so an
-- admin invites their email (org_invites) and it becomes a membership when they sign in with Google.

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  next_shoot_number int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
create index orgs_created_by_idx on public.orgs (created_by);
create trigger set_updated_at before update on public.orgs
  for each row execute function private.set_updated_at();
comment on column public.orgs.next_shoot_number is 'The number in the next shoot code (S001, S002…): each org counts its own.';

create table public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_id_idx on public.org_members (user_id);
create trigger set_updated_at before update on public.org_members
  for each row execute function private.set_updated_at();

alter table public.profiles add column active_org_id uuid references public.orgs (id) on delete set null;
comment on column public.profiles.active_org_id is 'The org this user last switched to. Set through public.set_active_org.';
create index profiles_active_org_id_idx on public.profiles (active_org_id);

-- --- which org a request is for ---------------------------------------------------------------
-- The org_id claim when the access token hook is on, else the org the user last switched to, else
-- their first. Always one they're a member of right now, so removal takes effect at once and a
-- forged or stale claim gets nothing.
create function private.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.org_id
  from public.org_members m
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid())
  order by
    (m.org_id::text = (select auth.jwt() ->> 'org_id')) desc nulls last,
    (m.org_id = p.active_org_id) desc nulls last,
    m.created_at,
    m.org_id
  limit 1;
$$;

create function private.is_org_member(p_org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = (select auth.uid())
  );
$$;

create function private.is_org_admin(p_org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

revoke all on function private.current_org_id(), private.is_org_member(uuid), private.is_org_admin(uuid) from public, anon;
grant execute on function private.current_org_id(), private.is_org_member(uuid), private.is_org_admin(uuid) to authenticated, service_role;

-- --- invites -----------------------------------------------------------------------------------
create table public.org_invites (
  org_id uuid not null default private.current_org_id() references public.orgs (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (org_id, email)
);
create index org_invites_email_idx on public.org_invites (email);
create index org_invites_created_by_idx on public.org_invites (created_by);

-- Signed in with Google, as before: a Google account's email is verified, so an invite can't be
-- claimed by someone merely typing that address.
create function private.accept_org_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google' then
    insert into public.org_members (org_id, user_id, role, display_name)
    select i.org_id, new.id, i.role, i.display_name
    from public.org_invites i
    where i.email = lower(new.email)
    on conflict do nothing;
    delete from public.org_invites where email = lower(new.email);
  end if;
  return new;
end $$;
-- runs after sync_profile has made the profile (triggers fire by name)
create trigger z_accept_org_invites after insert or update of email, raw_app_meta_data on auth.users
  for each row execute function private.accept_org_invites();

-- Inviting someone who has already signed in makes them a member straight away.
create function private.invite_existing_user() returns trigger
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
  return null;
end $$;
create trigger invite_existing_user before insert on public.org_invites
  for each row execute function private.invite_existing_user();
revoke all on function private.accept_org_invites(), private.invite_existing_user() from public, anon, authenticated;

-- --- access -------------------------------------------------------------------------------------
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;

create policy "members can read their orgs" on public.orgs for select to authenticated
  using ((select private.is_org_member(id)));
create policy "org admins can update" on public.orgs for update to authenticated
  using ((select private.is_org_admin(id))) with check ((select private.is_org_admin(id)));
grant select on public.orgs to authenticated;
grant update (name) on public.orgs to authenticated;

-- only the current org's members: the rows every "am I in an org?" check reads
create policy "org members can read" on public.org_members for select to authenticated
  using (org_id = (select private.current_org_id()));
create policy "org admins can update" on public.org_members for update to authenticated
  using (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())))
  with check (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
create policy "org admins can delete" on public.org_members for delete to authenticated
  using (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
grant select, delete on public.org_members to authenticated;
grant update (role, display_name) on public.org_members to authenticated;

create policy "org admins can read" on public.org_invites for select to authenticated
  using (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
create policy "org admins can insert" on public.org_invites for insert to authenticated
  with check (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
create policy "org admins can update" on public.org_invites for update to authenticated
  using (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())))
  with check (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
create policy "org admins can delete" on public.org_invites for delete to authenticated
  using (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
grant select, insert, update, delete on public.org_invites to authenticated;

-- --- what the app calls ---------------------------------------------------------------------------
-- The signed-in user's orgs, with their role in each and which one this request is for.
create function public.my_orgs()
returns table (id uuid, name text, slug text, role text, display_name text, is_current boolean, has_chosen boolean)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.slug, m.role, m.display_name,
    o.id = private.current_org_id(),
    p.active_org_id is not null
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid())
  order by o.name;
$$;

create function public.set_active_org(p_org_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_org_member(p_org_id) then
    raise exception 'You''re not a member of that org';
  end if;
  update public.profiles set active_org_id = p_org_id where id = (select auth.uid());
end $$;

-- Self-serve orgs stay closed until billing exists (they'd spend the AI budget for free).
create table private.platform (
  id boolean primary key default true check (id),
  org_signup_open boolean not null default false
);
insert into private.platform default values;
revoke all on private.platform from public, anon, authenticated;

create function public.org_signup_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select org_signup_open from private.platform;
$$;

revoke all on function public.my_orgs(), public.set_active_org(uuid), public.org_signup_open() from public, anon;
grant execute on function public.my_orgs(), public.set_active_org(uuid), public.org_signup_open() to authenticated, service_role;

-- Puts the org in the access token (Dashboard: Authentication > Hooks). Optional: without it,
-- current_org_id falls back to the user's active org.
create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  org uuid;
begin
  select m.org_id into org
  from public.org_members m
  join public.profiles p on p.id = m.user_id
  where m.user_id = (event ->> 'user_id')::uuid
  order by (m.org_id = p.active_org_id) desc nulls last, m.created_at, m.org_id
  limit 1;
  if org is not null then
    event := jsonb_set(event, '{claims,org_id}', to_jsonb(org::text));
  end if;
  return event;
end $$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- --- the one org so far ----------------------------------------------------------------------------
insert into public.orgs (name, slug, next_shoot_number)
select 'topdogugc', 'topdogugc', (select case when is_called then last_value + 1 else last_value end from public.shoot_code_seq);

insert into public.org_members (org_id, user_id, role, display_name)
select o.id, p.id, a.role, a.display_name
from public.allowed_users a
join public.profiles p on p.email = lower(a.email)
cross join (select id from public.orgs where slug = 'topdogugc') o;

insert into public.org_invites (org_id, email, role, display_name)
select o.id, lower(a.email), a.role, a.display_name
from public.allowed_users a
cross join (select id from public.orgs where slug = 'topdogugc') o
where not exists (select 1 from public.profiles p where p.email = lower(a.email));

update public.profiles p set active_org_id = (select id from public.orgs where slug = 'topdogugc')
where exists (select 1 from public.org_members m where m.user_id = p.id);
