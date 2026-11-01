-- A row can only point at rows in its own org. Foreign keys now include org_id, so a request can't
-- attach its org's rows to another org's record, even knowing its id, and a row can't be moved to
-- another org while anything points at it. Replaces each key in place: same name, same ON DELETE.
-- (treatments.parts is an array, so a key can't cover it; the app only resolves parts it can read.)

do $$
declare
  fk record;
  org_tables text[] := array[
    'angles', 'batch_scores', 'body_template_products', 'body_templates', 'brand_channels', 'brands',
    'broll_shots', 'channels', 'cta_templates', 'dropbox_connection', 'formats', 'hook_templates',
    'people', 'person_channels', 'product_features', 'products', 'settings', 'shoot_channels',
    'shoot_clips', 'shoot_element_overrides', 'shoot_formats', 'shoot_items', 'shoot_manifests',
    'shoot_people', 'shoot_shortlists', 'shoots', 'treatments', 'vo_cast', 'vo_cta_links', 'vo_hook_links'
  ];
  parent text;
  col text;
  on_delete text;
  replaced int := 0;
begin
  -- what a composite key points at
  foreach parent in array array[
    'angles', 'body_templates', 'brands', 'channels', 'cta_templates', 'formats', 'hook_templates',
    'people', 'product_features', 'products', 'shoot_shortlists', 'shoots'
  ] loop
    execute format('alter table public.%I add constraint %I unique (org_id, id)', parent, parent || '_org_id_id_key');
  end loop;

  for fk in
    select c.conname, ch.relname as child, pa.relname as parent, c.confdeltype, c.conkey
    from pg_constraint c
    join pg_class ch on ch.oid = c.conrelid
    join pg_class pa on pa.oid = c.confrelid
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and ch.relname = any (org_tables)
      and pa.relname = any (org_tables)
      -- shoot_items -> shoot_people is covered by its own keys to shoots and people
      and cardinality(c.conkey) = 1
  loop
    select a.attname into col from pg_attribute a where a.attrelid = format('public.%I', fk.child)::regclass and a.attnum = fk.conkey[1];
    -- org_id can't be nulled, so SET NULL names the one column it clears
    on_delete := case fk.confdeltype
      when 'c' then 'cascade'
      when 'r' then 'restrict'
      when 'n' then format('set null (%I)', col)
      when 'a' then 'no action'
      else null
    end;
    if on_delete is null then
      raise exception 'Unexpected ON DELETE on %', fk.conname;
    end if;
    execute format('alter table public.%I drop constraint %I', fk.child, fk.conname);
    execute format('alter table public.%I add constraint %I foreign key (org_id, %I) references public.%I (org_id, id) on delete %s',
      fk.child, fk.conname, col, fk.parent, on_delete);
    execute format('create index if not exists %I on public.%I (org_id, %I)', fk.conname || '_idx', fk.child, col);
    replaced := replaced + 1;
  end loop;

  -- never silently do nothing
  if replaced <> 47 then
    raise exception 'Expected to replace 47 foreign keys, replaced %', replaced;
  end if;
end $$;

-- A person can only be linked to a member of their org, and removing the member clears the link.
alter table public.people drop constraint people_user_id_fkey;
alter table public.people add constraint people_org_member_fkey
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete set null (user_id);
