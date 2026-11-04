-- Top Dog Cut (Phase 5): a one-time purchase per org, recorded by the Stripe webhook. Using Cut
-- needs a live Kit (org_is_entitled) and Cut access, which is any of: the org bought it, the org is
-- billing-exempt (topdogugc), or its Kit subscription is trialing (a temporary grant that ends with
-- the trial). Pawcessor learns this from a signed license token (server/api/license/*), which reads
-- org_license_state so the token and the database can't disagree.

alter table public.orgs
  add column cut_purchased_at timestamptz,
  add column cut_payment_intent_id text unique;
comment on column public.orgs.cut_purchased_at is 'When the org bought Top Dog Cut (null: not bought, or refunded). Written by the Stripe webhook only.';
comment on column public.orgs.cut_payment_intent_id is 'The Stripe PaymentIntent that bought Cut, so a refund can take it back.';

-- How the org has Cut: 'purchased', 'exempt', 'trial' or 'none'
create function private.org_cut_access(p_org_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when o.cut_purchased_at is not null then 'purchased'
    when o.billing_exempt then 'exempt'
    when exists (select 1 from public.org_subscriptions s where s.org_id = o.id and s.status = 'trialing') then 'trial'
    else 'none'
  end
  from public.orgs o
  where o.id = p_org_id;
$$;
revoke all on function private.org_cut_access(uuid) from public, anon;
grant execute on function private.org_cut_access(uuid) to authenticated, service_role;

-- Can this org use Cut right now? A live Kit and Cut access.
create function private.org_can_use_cut(p_org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.org_is_entitled(p_org_id) and coalesce(private.org_cut_access(p_org_id), 'none') <> 'none';
$$;
revoke all on function private.org_can_use_cut(uuid) from public, anon;
grant execute on function private.org_can_use_cut(uuid) to authenticated, service_role;

-- Everything a license token says about an org, for the server (service role) only
create function public.org_license_state(p_org_id uuid)
returns table (entitled boolean, cut_access text, can_use_cut boolean, trial_end timestamptz)
language sql stable security definer set search_path = '' as $$
  select private.org_is_entitled(o.id),
    private.org_cut_access(o.id),
    private.org_can_use_cut(o.id),
    (select s.trial_end from public.org_subscriptions s where s.org_id = o.id and s.status = 'trialing')
  from public.orgs o
  where o.id = p_org_id;
$$;
revoke all on function public.org_license_state(uuid) from public, anon, authenticated;
grant execute on function public.org_license_state(uuid) to service_role;

-- my_orgs gains how each org has Cut (for the Billing page)
drop function public.my_orgs();
create function public.my_orgs()
returns table (id uuid, name text, slug text, role text, display_name text, is_current boolean, has_chosen boolean, entitled boolean, cut_access text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.slug, m.role, m.display_name,
    o.id = private.current_org_id(),
    p.active_org_id is not null,
    private.org_is_entitled(o.id),
    private.org_cut_access(o.id)
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid())
  order by o.name;
$$;
revoke all on function public.my_orgs() from public, anon;
grant execute on function public.my_orgs() to authenticated, service_role;
