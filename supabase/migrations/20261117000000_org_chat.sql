-- Organisation chat (spec §4): one channel per organisation, for everyone in it. Messages are text,
-- shared Library items, brands and shoots (cards), or Kreate's own updates (a shoot moving along,
-- someone joining, an AI app adding drafts). Live through Supabase Realtime.

create table public.org_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default private.current_org_id() references public.orgs (id) on delete cascade,
  -- who wrote it; null for Kreate's own updates
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  kind text not null check (kind in ('text', 'share', 'event')),
  body text not null default '' check (length(body) <= 4000),
  -- share: { type, id, title, preview, path }; event: { event, ... }
  ref jsonb check (ref is null or jsonb_typeof(ref) = 'object'),
  -- the AI app's name, when it posted through the connector (set by the database, not the client)
  via text,
  reply_to uuid references public.org_messages (id) on delete set null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
comment on table public.org_messages is 'The organisation''s chat: one channel per org. Kind text or share by people (or their AI app), event by Kreate.';
create index org_messages_org_created_idx on public.org_messages (org_id, created_at desc);
create index org_messages_author_id_idx on public.org_messages (author_id);
create index org_messages_reply_to_idx on public.org_messages (reply_to);

alter table public.org_messages enable row level security;
revoke all on public.org_messages from anon, authenticated;
grant select, insert on public.org_messages to authenticated;
grant update (body, edited_at, deleted_at) on public.org_messages to authenticated;
create policy "org members read the chat" on public.org_messages for select to authenticated
  using (org_id = (select private.current_org_id()));
create policy "org members post as themselves" on public.org_messages for insert to authenticated
  with check (
    org_id = (select private.current_org_id())
    and author_id = (select auth.uid())
    and kind in ('text', 'share')
  );
create policy "authors edit their own" on public.org_messages for update to authenticated
  using (org_id = (select private.current_org_id()) and author_id = (select auth.uid()))
  with check (org_id = (select private.current_org_id()) and author_id = (select auth.uid()));

-- posted through an AI app: name the app (from its token), whatever the client sent
create function private.stamp_message_via() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  client text := (select auth.jwt() ->> 'client_id');
begin
  new.via := case when client is null then null
    else coalesce((select c.client_name from auth.oauth_clients c where c.id::text = client), 'an AI app') end;
  return new;
end $$;
create trigger stamp_message_via before insert on public.org_messages
  for each row when (new.kind <> 'event') execute function private.stamp_message_via();

alter publication supabase_realtime add table public.org_messages;

-- Where each person is up to, for unread counts.
create table public.org_chat_reads (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_chat_reads_user_id_idx on public.org_chat_reads (user_id);
alter table public.org_chat_reads enable row level security;
revoke all on public.org_chat_reads from anon, authenticated;
grant select on public.org_chat_reads to authenticated;
create policy "people read their own" on public.org_chat_reads for select to authenticated
  using (user_id = (select auth.uid()));

create function public.mark_chat_read()
returns void
language sql security definer set search_path = '' as $$
  insert into public.org_chat_reads (org_id, user_id, last_read_at)
  select private.current_org_id(), (select auth.uid()), now()
  where private.current_org_id() is not null
  on conflict (org_id, user_id) do update set last_read_at = excluded.last_read_at;
$$;

create function public.chat_unread_count()
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.org_messages m
  where m.org_id = private.current_org_id()
    and m.deleted_at is null
    and m.author_id is distinct from (select auth.uid())
    and m.created_at > coalesce(
      (select r.last_read_at from public.org_chat_reads r where r.org_id = m.org_id and r.user_id = (select auth.uid())),
      '-infinity'::timestamptz
    );
$$;
revoke all on function public.mark_chat_read(), public.chat_unread_count() from public, anon;
grant execute on function public.mark_chat_read(), public.chat_unread_count() to authenticated;

-- --- Kreate's own updates ---------------------------------------------------------------------
-- Which kinds an organisation posts (Settings → Defaults); a missing key means on.
alter table public.settings add column chat_events jsonb not null default '{}'::jsonb
  check (jsonb_typeof(chat_events) = 'object');
comment on column public.settings.chat_events is 'Which of Kreate''s updates go to the chat, by kind (shoot_planned, shoot_shooting, shoot_filmed, shoot_editing, shoot_live, member_joined, ai_drafts); missing means on.';

create function private.post_org_event(p_org_id uuid, p_event text, p_body text, p_ref jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select (s.chat_events ->> p_event)::boolean from public.settings s where s.org_id = p_org_id), true) then
    insert into public.org_messages (org_id, author_id, kind, body, ref)
    values (p_org_id, null, 'event', p_body, coalesce(p_ref, '{}'::jsonb) || jsonb_build_object('event', p_event));
  end if;
end $$;

-- a shoot moving forward: planned, filming, filmed, editing, Live
create function private.chat_shoot_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  steps constant text[] := array['draft', 'planned', 'shooting', 'filmed', 'editing', 'edited'];
  what text;
  label text;
begin
  if new.status is not distinct from old.status
    or coalesce(array_position(steps, new.status), 0) <= coalesce(array_position(steps, old.status), 0) then
    return new;
  end if;
  label := case new.status
    when 'planned' then 'is planned'
    when 'shooting' then 'is being filmed'
    when 'filmed' then 'is filmed'
    when 'editing' then 'is in editing'
    when 'edited' then 'is Live'
  end;
  if label is null then return new; end if;
  select concat_ws(' · ', b.name, p.name) into what
  from public.products p join public.brands b on b.id = p.brand_id
  where p.id = new.product_id;
  perform private.post_org_event(
    new.org_id,
    'shoot_' || case new.status when 'edited' then 'live' else new.status end,
    concat(new.code, ' ', label, case when what is not null then ' (' || what || ')' end, '.'),
    jsonb_build_object('shoot_code', new.code, 'shoot_id', new.id, 'status', new.status)
  );
  return new;
end $$;
create trigger chat_shoot_status after update of status on public.shoots
  for each row execute function private.chat_shoot_status();

-- someone joining
create function private.chat_member_joined() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who text;
begin
  select coalesce(new.display_name, p.display_name, p.full_name, p.email) into who from public.profiles p where p.id = new.user_id;
  perform private.post_org_event(new.org_id, 'member_joined', concat(coalesce(who, 'Someone'), ' joined.'), jsonb_build_object('user_id', new.user_id));
  return new;
end $$;
create trigger chat_member_joined after insert on public.org_members
  for each row execute function private.chat_member_joined();

-- an AI app adding drafts (the connector calls this after add_hooks / add_ctas)
create function public.post_ai_drafts_event(p_kind text, p_count integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  org uuid := private.current_org_id();
  app text := coalesce((select c.client_name from auth.oauth_clients c where c.id::text = (select auth.jwt() ->> 'client_id')), 'An AI app');
  who text;
begin
  if org is null or p_count < 1 or p_kind not in ('hooks', 'CTAs') then return; end if;
  select coalesce(m.display_name, p.display_name, p.full_name, p.email) into who
  from public.org_members m join public.profiles p on p.id = m.user_id
  where m.org_id = org and m.user_id = (select auth.uid());
  perform private.post_org_event(org, 'ai_drafts',
    concat(app, ' added ', p_count, ' ', case when p_count = 1 then rtrim(p_kind, 's') else p_kind end, ' for ', coalesce(who, 'someone'), ' to review.'),
    jsonb_build_object('kind', p_kind, 'count', p_count, 'app', app));
end $$;
revoke all on function public.post_ai_drafts_event(text, integer) from public, anon;
grant execute on function public.post_ai_drafts_event(text, integer) to authenticated;
