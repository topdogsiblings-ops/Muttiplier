-- Every table the app works with now belongs to an org. Everything so far goes to topdogugc, and
-- new rows default to the current org, so inserts don't have to say. Names, slugs and codes only
-- have to be unique within an org.

do $$
declare
  t text;
  org uuid := (select id from public.orgs where slug = 'topdogugc');
begin
  foreach t in array array[
    'angles', 'batch_scores', 'body_template_products', 'body_templates', 'brand_channels', 'brands',
    'broll_shots', 'channels', 'cta_templates', 'dropbox_connection', 'formats', 'hook_templates',
    'people', 'person_channels', 'product_features', 'products', 'settings', 'shoot_channels',
    'shoot_clips', 'shoot_element_overrides', 'shoot_formats', 'shoot_items', 'shoot_manifests',
    'shoot_people', 'shoot_shortlists', 'shoots', 'treatments', 'vo_cast', 'vo_cta_links', 'vo_hook_links'
  ] loop
    execute format('alter table public.%I add column org_id uuid references public.orgs (id) on delete cascade', t);
    -- the backfill isn't an edit: no updated_at, no status stamps
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set org_id = %L', t, org);
    execute format('alter table public.%I enable trigger user', t);
    execute format('alter table public.%I alter column org_id set not null', t);
    execute format('alter table public.%I alter column org_id set default private.current_org_id()', t);
    execute format('create index %I on public.%I (org_id)', t || '_org_id_idx', t);
  end loop;
end $$;

-- unique within an org
alter table public.angles drop constraint angles_name_key, add constraint angles_org_name_key unique (org_id, name);
alter table public.brands drop constraint brands_slug_key, add constraint brands_org_slug_key unique (org_id, slug);
alter table public.brands drop constraint brands_trybe_brand_id_key, add constraint brands_org_trybe_brand_id_key unique (org_id, trybe_brand_id);
alter table public.channels drop constraint channels_slug_key, add constraint channels_org_slug_key unique (org_id, slug);
alter table public.formats drop constraint formats_code_key, add constraint formats_org_code_key unique (org_id, code);
alter table public.people drop constraint people_slug_key, add constraint people_org_slug_key unique (org_id, slug);
alter table public.shoots drop constraint shoots_code_key, add constraint shoots_org_code_key unique (org_id, code);
alter table public.treatments drop constraint treatments_name_key, add constraint treatments_org_name_key unique (org_id, name);

-- one row per org (the singleton column goes once the app stops filtering on it)
alter table public.settings drop constraint settings_singleton_key, add constraint settings_org_key unique (org_id);
alter table public.dropbox_connection drop constraint dropbox_connection_singleton_key, add constraint dropbox_connection_org_key unique (org_id);

-- A person links straight to their account. A person belongs to one org; someone in two orgs is a
-- separate person in each.
alter table public.people add column user_id uuid references public.profiles (id) on delete set null;
alter table public.people disable trigger user;
update public.people pe set user_id = p.id
from public.allowed_users a
join public.profiles p on p.email = lower(a.email)
where pe.allowed_user_id = a.id;
alter table public.people enable trigger user;
alter table public.people add constraint people_org_user_key unique (org_id, user_id);
create index people_user_id_idx on public.people (user_id);

-- Each org counts its own shoots: a new org's first is S001. Someone not in an org can't make one.
create or replace function private.next_shoot_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.orgs set next_shoot_number = next_shoot_number + 1
  where id = private.current_org_id()
  returning next_shoot_number - 1 into n;
  if n is null then
    raise exception 'Not in an org';
  end if;
  return 'S' || lpad(n::text, greatest(3, length(n::text)), '0');
end $$;
drop sequence public.shoot_code_seq;

-- A new org: the signed-in user as its admin, its own default settings and the built-in treatments
-- every org has. Its Library otherwise starts empty.
create function public.create_org(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  org uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not public.org_signup_open() then raise exception 'New organisations aren''t open yet'; end if;
  insert into public.orgs (name, slug, created_by) values (trim(p_name), p_slug, me) returning id into org;
  insert into public.org_members (org_id, user_id, role) values (org, me, 'admin');
  update public.profiles set active_org_id = org where id = me;
  insert into public.settings (org_id) values (org);
  insert into public.treatments (org_id, name, description, kind, placement, needs, component, settings, active, system, sort_order) values
    (org, 'Face to camera', 'The whole video with the speaker on camera: every VO beat shows them talking (a talking-head version). Skipped where a recipe already shows them throughout.', 'layout', 'video', array['speaker_video'], 'layout', '{"show": "face"}', true, true, 1),
    (org, 'Over b-roll', 'The whole video over b-roll: every VO beat is their voice over footage, none on camera. Skipped where a recipe already plays over b-roll throughout.', 'layout', 'video', '{}', 'layout', '{"show": "broll"}', true, true, 2);
  return org;
end $$;
revoke all on function public.create_org(text, text) from public, anon;
grant execute on function public.create_org(text, text) to authenticated, service_role;
