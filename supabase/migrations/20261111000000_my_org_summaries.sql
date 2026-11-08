-- Your account → Organisations: a summary of each org you're in, at a glance. RLS only shows the
-- current org's rows, so this counts across your orgs (only ones you're a member of, and only
-- counts and billing state, which every member already sees in that org).
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
  cancel_at_period_end boolean
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
    sub.cancel_at_period_end
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
