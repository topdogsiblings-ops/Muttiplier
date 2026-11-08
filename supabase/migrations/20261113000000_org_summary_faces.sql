-- Your account → Organisations shows each org's team as faces: the summary also returns up to
-- four members (admins first) with their name and photo.
drop function public.my_org_summaries();
create function public.my_org_summaries()
returns table (
  org_id uuid,
  members integer,
  admins integer,
  invites integer,
  channels integer,
  brands integer,
  products integer,
  hooks integer,
  ctas integer,
  draft_shoots integer,
  active_shoots integer,
  live_shoots integer,
  shoots_this_month integer,
  last_shoot_at timestamptz,
  billing_exempt boolean,
  subscription_status text,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  faces jsonb
)
language sql stable security definer set search_path = '' as $$
  select o.id,
    (select count(*) from public.org_members x where x.org_id = o.id)::integer,
    (select count(*) from public.org_members x where x.org_id = o.id and x.role = 'admin')::integer,
    (select count(*) from public.org_invites i where i.org_id = o.id)::integer,
    (select count(*) from public.channels c where c.org_id = o.id and c.active)::integer,
    (select count(*) from public.brands b where b.org_id = o.id)::integer,
    (select count(*) from public.products p where p.org_id = o.id)::integer,
    (select count(*) from public.hook_templates h where h.org_id = o.id)::integer,
    (select count(*) from public.cta_templates c where c.org_id = o.id)::integer,
    sh.drafts, sh.active, sh.live, sh.this_month, sh.last_at,
    o.billing_exempt,
    sub.status,
    sub.trial_end,
    sub.current_period_end,
    sub.cancel_at_period_end,
    (select coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'photo', f.photo) order by f.admin desc, f.joined), '[]'::jsonb)
     from (
       select coalesce(x.display_name, p.display_name, p.full_name, p.email) as name,
         coalesce(p.photo_url, p.avatar_url) as photo,
         x.role = 'admin' as admin,
         x.created_at as joined
       from public.org_members x
       join public.profiles p on p.id = x.user_id
       where x.org_id = o.id
       order by x.role = 'admin' desc, x.created_at
       limit 4
     ) f)
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  cross join lateral (
    select
      (count(*) filter (where s.status = 'draft'))::integer as drafts,
      -- planned, being filmed, filmed or being edited: on its way to Live
      (count(*) filter (where s.status in ('planned', 'shooting', 'filmed', 'editing')))::integer as active,
      (count(*) filter (where s.status = 'edited'))::integer as live,
      (count(*) filter (where s.created_at >= date_trunc('month', now())))::integer as this_month,
      max(s.created_at) as last_at
    from public.shoots s
    where s.org_id = o.id
  ) sh
  left join lateral (
    select s.status, s.trial_end, s.current_period_end, s.cancel_at_period_end
    from public.org_subscriptions s
    where s.org_id = o.id
    order by s.created_at desc
    limit 1
  ) sub on true
  where m.user_id = (select auth.uid());
$$;
revoke all on function public.my_org_summaries() from public, anon;
grant execute on function public.my_org_summaries() to authenticated;
