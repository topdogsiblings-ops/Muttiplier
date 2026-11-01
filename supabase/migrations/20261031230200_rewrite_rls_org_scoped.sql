-- Every policy on an org's tables now means "in the org this request is for" instead of "on the
-- allowlist", and "an admin of it" instead of "an admin". Reads are limited to the current org too,
-- not just any org the user is in, so someone in two orgs never sees them mixed. allowed_users and
-- its functions stay until the app that reads them is gone, but they no longer grant anything else.

do $$
declare
  p record;
  member constant text := 'org_id = (select private.current_org_id())';
  admin constant text := '(org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())))';
  q text;
  c text;
  new_name text;
begin
  for p in
    select tablename, policyname, cmd, qual, with_check from pg_policies
    where schemaname = 'public' and tablename = any (array[
      'angles', 'batch_scores', 'body_template_products', 'body_templates', 'brand_channels', 'brands',
      'broll_shots', 'channels', 'cta_templates', 'dropbox_connection', 'formats', 'hook_templates',
      'people', 'person_channels', 'product_features', 'products', 'settings', 'shoot_channels',
      'shoot_clips', 'shoot_element_overrides', 'shoot_formats', 'shoot_items', 'shoot_manifests',
      'shoot_people', 'shoot_shortlists', 'shoots', 'treatments', 'vo_cast', 'vo_cta_links', 'vo_hook_links'
    ])
  loop
    q := replace(replace(p.qual, '( SELECT private.is_allowed() AS is_allowed)', member), '( SELECT private.is_admin() AS is_admin)', admin);
    c := replace(replace(p.with_check, '( SELECT private.is_allowed() AS is_allowed)', member), '( SELECT private.is_admin() AS is_admin)', admin);
    if p.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, q);
    elsif p.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, c);
    else
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename, q, c);
    end if;
    new_name := replace(replace(p.policyname, 'allowlisted users', 'org members'), 'admins', 'org admins');
    if new_name <> p.policyname then
      execute format('alter policy %I on public.%I rename to %I', p.policyname, p.tablename, new_name);
    end if;
  end loop;

  -- nothing on an org's tables may still lean on the allowlist
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename not in ('allowed_users', 'profiles')
      and (coalesce(qual, '') ~ 'is_allowed|is_admin\(\)' or coalesce(with_check, '') ~ 'is_allowed|is_admin\(\)')
  ) then
    raise exception 'A policy still uses the allowlist';
  end if;
end $$;

-- A person's name and email are only visible to people sharing their current org.
alter policy "allowlisted users can read" on public.profiles using (
  id = (select auth.uid())
  or exists (select 1 from public.org_members m where m.user_id = profiles.id and m.org_id = (select private.current_org_id()))
);
alter policy "allowlisted users can read" on public.profiles rename to "org members can read";

create or replace function private.is_me(p_person_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.people p
    where p.id = p_person_id and p.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_edit_vo(p_body_template_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.body_templates b
    where b.id = p_body_template_id
      and (private.is_org_admin(b.org_id) or private.is_me(b.person_id))
  );
$$;
