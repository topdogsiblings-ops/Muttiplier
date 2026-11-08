-- The AI connector across organisations (spec §11): when someone connects an AI app they pick which
-- of their organisations it may use, and each connector request names the one it's for.
--
-- 1. connector_org_access: the organisations each AI app (OAuth client) may use, per person. Set on
--    the consent page and in Your account → Connect your AI (public.set_connector_orgs).
-- 2. private.current_org_id() learns two things:
--    - a request can name its organisation with the `x-kreate-org` header (the connector does, per
--      tool call); it's only honoured for an organisation the person is a member of;
--    - a request made with an AI app's token (its JWT carries client_id) only ever resolves to an
--      organisation that app was allowed. An app connected before this, with no rows, keeps the old
--      behaviour (the person's current organisation).

create table public.connector_org_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null,
  org_id uuid not null references public.orgs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id, org_id)
);
comment on table public.connector_org_access is 'Which organisations each AI app a person connected may use. Written by public.set_connector_orgs.';
create index connector_org_access_org_id_idx on public.connector_org_access (org_id);

alter table public.connector_org_access enable row level security;
revoke all on public.connector_org_access from anon, authenticated;
grant select on public.connector_org_access to authenticated;
create policy "people read their own" on public.connector_org_access for select to authenticated
  using (user_id = (select auth.uid()));

-- Replace which organisations an AI app may use (only ones the person is in). An AI app can't
-- change its own access: only a browser session can.
create function public.set_connector_orgs(p_client_id uuid, p_org_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in'; end if;
  if (select auth.jwt() ->> 'client_id') is not null then raise exception 'Change this in Kreate'; end if;
  delete from public.connector_org_access where user_id = me and client_id = p_client_id;
  insert into public.connector_org_access (user_id, client_id, org_id)
  select me, p_client_id, m.org_id
  from public.org_members m
  where m.user_id = me and m.org_id = any (p_org_ids)
  on conflict do nothing;
end $$;
revoke all on function public.set_connector_orgs(uuid, uuid[]) from public, anon;
grant execute on function public.set_connector_orgs(uuid, uuid[]) to authenticated;

create or replace function private.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  with request as (
    select
      (select auth.uid()) as uid,
      (select auth.jwt() ->> 'client_id') as client,
      (select auth.jwt() ->> 'org_id') as token_org,
      nullif(current_setting('request.headers', true), '')::json ->> 'x-kreate-org' as asked
  )
  select m.org_id
  from request r
  join public.org_members m on m.user_id = r.uid
  join public.profiles p on p.id = m.user_id
  where
    -- an AI app's token: only organisations it was allowed (none set: as before)
    r.client is null
    or not exists (select 1 from public.connector_org_access a where a.user_id = r.uid and a.client_id::text = r.client)
    or exists (select 1 from public.connector_org_access a where a.user_id = r.uid and a.client_id::text = r.client and a.org_id = m.org_id)
  order by
    (m.org_id::text = r.asked) desc nulls last,
    (m.org_id::text = r.token_org) desc nulls last,
    (m.org_id = p.active_org_id) desc nulls last,
    m.created_at,
    m.org_id
  limit 1;
$$;
