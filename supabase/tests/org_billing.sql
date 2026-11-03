-- Billing: an org without a live subscription can't use the app (unless billing-exempt), only the
-- server can write billing rows or usage, and a member reads only their own org's subscription.
-- Raises on the first failure, and rolls everything back either way.
-- Run it in the Supabase SQL editor, or with psql against the project.

begin;

do $$
declare
  a_org uuid := (select id from public.orgs where slug = 'topdogugc');
  a_admin uuid := (select user_id from public.org_members where org_id = (select id from public.orgs where slug = 'topdogugc') and role = 'admin' limit 1);
  b_user uuid := gen_random_uuid();
  b_org uuid;
  be_a text := json_build_object('sub', a_admin, 'role', 'authenticated')::text;
  be_b text := json_build_object('sub', b_user, 'role', 'authenticated')::text;
begin
  insert into auth.users (id, email, aud, role) values (b_user, 'billing-test@example.com', 'authenticated', 'authenticated');
  update private.platform set org_signup_open = true;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', be_b, true);
  b_org := public.create_org('Billing Test', 'billing-test');

  -- a new org isn't entitled until it subscribes; the founding org is exempt
  if (select entitled from public.my_orgs() where id = b_org) then raise exception 'FAILED: a new org is entitled without a subscription'; end if;

  -- members can't write billing or usage
  begin
    insert into public.org_subscriptions (org_id, stripe_customer_id, status) values (b_org, 'cus_fake', 'active');
    raise exception 'FAILED: a member wrote their own subscription';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_ai_usage(b_org, -100000, 0, 0, 0);
    raise exception 'FAILED: a member wrote AI usage';
  exception when insufficient_privilege then null;
  end;

  -- the server syncs a trial: entitled
  perform set_config('role', 'postgres', true);
  insert into public.org_subscriptions (org_id, stripe_customer_id, stripe_subscription_id, status, trial_used)
  values (b_org, 'cus_test_billing', 'sub_test_billing', 'trialing', true);
  perform public.record_ai_usage(b_org, 100, 50, 0, 0);
  perform public.record_ai_usage(b_org, 10, 5, 0, 0);
  if (select requests from public.org_ai_usage where org_id = b_org) <> 2 then raise exception 'FAILED: usage didn''t add up'; end if;

  perform set_config('role', 'authenticated', true);
  if not (select entitled from public.my_orgs() where id = b_org) then raise exception 'FAILED: a trialing org isn''t entitled'; end if;
  if (select count(*) from public.org_subscriptions) <> 1 then raise exception 'FAILED: B sees other orgs'' billing'; end if;

  -- cancelled: not entitled any more
  perform set_config('role', 'postgres', true);
  update public.org_subscriptions set status = 'canceled' where org_id = b_org;
  perform set_config('role', 'authenticated', true);
  if (select entitled from public.my_orgs() where id = b_org) then raise exception 'FAILED: a cancelled org is still entitled'; end if;

  -- the founding org is exempt, and A can't see B's billing or usage
  perform set_config('request.jwt.claims', be_a, true);
  if not (select entitled from public.my_orgs() where id = a_org) then raise exception 'FAILED: the founding org isn''t entitled'; end if;
  if exists (select 1 from public.org_subscriptions where org_id = b_org) then raise exception 'FAILED: A sees B''s billing'; end if;
  if exists (select 1 from public.org_ai_usage where org_id = b_org) then raise exception 'FAILED: A sees B''s usage'; end if;

  perform set_config('role', 'postgres', true);
  raise notice 'org billing: all checks passed';
end $$;

rollback;
