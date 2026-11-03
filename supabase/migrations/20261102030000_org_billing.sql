-- Billing (Phase 4): one Top Dog Kit subscription per org, kept in step with Stripe by its webhook.
-- Only the server writes these, with the service role; members can read their own org's. An org
-- can use the app while its subscription is trialing, active or past due (Stripe is still
-- retrying), or when it's billing-exempt (topdogugc). AI usage is logged per org per month so a
-- limit can be set once there's real data.

create table public.org_subscriptions (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  -- Stripe's subscription status: trialing, active, past_due, canceled, unpaid, incomplete, incomplete_expired, paused
  status text,
  price_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- the org has had a trial (one per org)
  trial_used boolean not null default false,
  -- when Stripe last told us about it, so an older event can't overwrite a newer one
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.org_subscriptions
  for each row execute function private.set_updated_at();
alter table public.org_subscriptions enable row level security;
create policy "org members can read" on public.org_subscriptions for select to authenticated
  using (org_id = (select private.current_org_id()));
grant select on public.org_subscriptions to authenticated;

alter table public.orgs add column billing_exempt boolean not null default false;
comment on column public.orgs.billing_exempt is 'Uses the app without a subscription (the founding org).';
update public.orgs set billing_exempt = true where slug = 'topdogugc';

-- Can this org use the app?
create function private.org_is_entitled(p_org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.billing_exempt from public.orgs o where o.id = p_org_id), false)
    or exists (
      select 1 from public.org_subscriptions s
      where s.org_id = p_org_id and s.status in ('trialing', 'active', 'past_due')
    );
$$;
revoke all on function private.org_is_entitled(uuid) from public, anon;
grant execute on function private.org_is_entitled(uuid) to authenticated, service_role;

-- my_orgs gains whether each org can use the app
drop function public.my_orgs();
create function public.my_orgs()
returns table (id uuid, name text, slug text, role text, display_name text, is_current boolean, has_chosen boolean, entitled boolean)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.slug, m.role, m.display_name,
    o.id = private.current_org_id(),
    p.active_org_id is not null,
    private.org_is_entitled(o.id)
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid())
  order by o.name;
$$;
revoke all on function public.my_orgs() from public, anon;
grant execute on function public.my_orgs() to authenticated, service_role;

-- AI drafting usage, per org per month (written by the server only)
create table public.org_ai_usage (
  org_id uuid not null references public.orgs (id) on delete cascade,
  month date not null,
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, month)
);
alter table public.org_ai_usage enable row level security;
create policy "org admins can read" on public.org_ai_usage for select to authenticated
  using (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
grant select on public.org_ai_usage to authenticated;

create function public.record_ai_usage(p_org_id uuid, p_input bigint, p_output bigint, p_cache_read bigint, p_cache_write bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.org_ai_usage as u (org_id, month, requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
  values (p_org_id, date_trunc('month', now())::date, 1, p_input, p_output, p_cache_read, p_cache_write)
  on conflict (org_id, month) do update set
    requests = u.requests + 1,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    cache_read_tokens = u.cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
    updated_at = now();
$$;
-- the server records usage with the service role; members can't inflate or wipe it
revoke all on function public.record_ai_usage(uuid, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, bigint, bigint, bigint, bigint) to service_role;
