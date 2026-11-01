-- Tables created since the first migration inherited Supabase's default grants: everything, for anon
-- and authenticated, including TRUNCATE, which row level security doesn't apply to. The API can't
-- issue TRUNCATE, and these tables' policies only cover authenticated, but nobody should hold these.
-- Back to what each table needs, and new tables now start with nothing.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['batch_scores', 'shoot_element_overrides', 'treatments', 'vo_cast', 'vo_cta_links', 'vo_hook_links'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
  end loop;
  foreach t in array array['orgs', 'org_members', 'org_invites'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on public.orgs to authenticated;
grant update (name) on public.orgs to authenticated;
grant select, delete on public.org_members to authenticated;
grant update (role, display_name) on public.org_members to authenticated;
grant select, insert, update, delete on public.org_invites to authenticated;
