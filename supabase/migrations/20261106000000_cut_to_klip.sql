-- Top Dog Cut is now UGC Klip: its columns and functions are renamed to match. Same rules as
-- 20261104000000: using Klip needs a live Kit (org_is_entitled) and Klip access, which is any of:
-- the org bought it, the org is billing-exempt (topdogugc), or its Kit subscription is trialing.

alter table public.orgs rename column cut_purchased_at to klip_purchased_at;
alter table public.orgs rename column cut_payment_intent_id to klip_payment_intent_id;
alter table public.orgs rename constraint orgs_cut_payment_intent_id_key to orgs_klip_payment_intent_id_key;
comment on column public.orgs.klip_purchased_at is 'When the org bought UGC Klip (null: not bought, or refunded). Written by the Stripe webhook only.';
comment on column public.orgs.klip_payment_intent_id is 'The Stripe PaymentIntent that bought Klip, so a refund can take it back.';

drop function public.my_orgs();
drop function public.org_license_state(uuid);
drop function private.org_can_use_cut(uuid);
drop function private.org_cut_access(uuid);

-- How the org has Klip: 'purchased', 'exempt', 'trial' or 'none'
create function private.org_klip_access(p_org_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when o.klip_purchased_at is not null then 'purchased'
    when o.billing_exempt then 'exempt'
    when exists (select 1 from public.org_subscriptions s where s.org_id = o.id and s.status = 'trialing') then 'trial'
    else 'none'
  end
  from public.orgs o
  where o.id = p_org_id;
$$;
revoke all on function private.org_klip_access(uuid) from public, anon;
grant execute on function private.org_klip_access(uuid) to authenticated, service_role;

-- Can this org use Klip right now? A live Kit and Klip access.
create function private.org_can_use_klip(p_org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.org_is_entitled(p_org_id) and coalesce(private.org_klip_access(p_org_id), 'none') <> 'none';
$$;
revoke all on function private.org_can_use_klip(uuid) from public, anon;
grant execute on function private.org_can_use_klip(uuid) to authenticated, service_role;

-- Everything a license token says about an org, for the server (service role) only
create function public.org_license_state(p_org_id uuid)
returns table (entitled boolean, klip_access text, can_use_klip boolean, trial_end timestamptz)
language sql stable security definer set search_path = '' as $$
  select private.org_is_entitled(o.id),
    private.org_klip_access(o.id),
    private.org_can_use_klip(o.id),
    (select s.trial_end from public.org_subscriptions s where s.org_id = o.id and s.status = 'trialing')
  from public.orgs o
  where o.id = p_org_id;
$$;
revoke all on function public.org_license_state(uuid) from public, anon, authenticated;
grant execute on function public.org_license_state(uuid) to service_role;

create function public.my_orgs()
returns table (id uuid, name text, slug text, role text, display_name text, is_current boolean, has_chosen boolean, entitled boolean, klip_access text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.slug, m.role, m.display_name,
    o.id = private.current_org_id(),
    p.active_org_id is not null,
    private.org_is_entitled(o.id),
    private.org_klip_access(o.id)
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid())
  order by o.name;
$$;
revoke all on function public.my_orgs() from public, anon;
grant execute on function public.my_orgs() to authenticated, service_role;
