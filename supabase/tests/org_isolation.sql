-- Cross-org isolation: org A (topdogugc) and a throwaway org B can't see or change each other's
-- rows, on every org-owned table. Raises on the first failure, and rolls everything back either way.
-- Run it in the Supabase SQL editor, or with psql against the project.

begin;

do $$
declare
  a_user uuid := (select m.user_id from public.org_members m join public.orgs o on o.id = m.org_id where o.slug = 'topdogugc' and m.role = 'admin' limit 1);
  a_org uuid := (select id from public.orgs where slug = 'topdogugc');
  b_user uuid := gen_random_uuid();
  b_org uuid;
  a_brand uuid := (select id from public.brands where org_id = (select id from public.orgs where slug = 'topdogugc') limit 1);
  a_channel uuid := (select id from public.channels where org_id = (select id from public.orgs where slug = 'topdogugc') limit 1);
  t text;
  n bigint;
  tables text[] := array[
    'angles', 'batch_scores', 'body_template_products', 'body_templates', 'brand_channels', 'brands',
    'broll_shots', 'channels', 'cta_templates', 'dropbox_connection', 'formats', 'hook_templates',
    'people', 'person_channels', 'product_features', 'products', 'settings', 'shoot_channels',
    'shoot_clips', 'shoot_element_overrides', 'shoot_formats', 'shoot_items', 'shoot_manifests',
    'shoot_people', 'shoot_shortlists', 'shoots', 'treatments', 'vo_cast', 'vo_cta_links', 'vo_hook_links'
  ];
  be_a text := json_build_object('sub', a_user, 'role', 'authenticated')::text;
  be_b text := json_build_object('sub', b_user, 'role', 'authenticated')::text;
begin
  insert into auth.users (id, email, aud, role) values (b_user, 'org-b-test@example.com', 'authenticated', 'authenticated');
  update private.platform set org_signup_open = true;

  -- --- as B: make an org, with a brand and a channel ------------------------
  perform set_config('request.jwt.claims', be_b, true);
  perform set_config('role', 'authenticated', true);
  b_org := public.create_org('Org B', 'org-b-test');
  insert into public.brands (name, slug, status) values ('B Brand', 'shared-slug', 'active');
  insert into public.channels (name, slug, dog_phrase, folder_slug) values ('B Channel', 'shared-slug', 'my dog', 'b');

  if (select count(*) from public.my_orgs()) <> 1 then raise exception 'B should see one org'; end if;
  if (select count(*) from public.orgs) <> 1 then raise exception 'B can read another org'; end if;
  if (select count(*) from public.org_members) <> 1 then raise exception 'B can read another org''s members'; end if;
  if (select count(*) from public.org_invites) <> 0 then raise exception 'B can read another org''s invites'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'B can read another org''s profiles'; end if;

  foreach t in array tables loop
    execute format('select count(*) from public.%I where org_id <> %L', t, b_org) into n;
    if n <> 0 then raise exception 'B can read % rows of % from another org', n, t; end if;
  end loop;

  -- a forged claim gets nothing: B stays in B
  perform set_config('request.jwt.claims', json_build_object('sub', b_user, 'role', 'authenticated', 'org_id', a_org)::text, true);
  if (select count(*) from public.brands where org_id = a_org) <> 0 then raise exception 'A forged org_id claim got into another org'; end if;
  perform set_config('request.jwt.claims', be_b, true);

  -- B can't write into A, or switch to it
  begin
    insert into public.brands (org_id, name, slug, status) values (a_org, 'Sneaky', 'sneaky', 'active');
    raise exception 'FAILED: B inserted into another org';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_active_org(a_org);
    raise exception 'FAILED: B switched to an org it isn''t in';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;
  if a_brand is not null then
    update public.brands set name = 'Hacked' where id = a_brand;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B updated another org''s brand'; end if;
    -- nobody can delete a brand (no grant at all), and that refusal counts as a pass too
    begin
      delete from public.brands where id = a_brand;
      get diagnostics n = row_count;
      if n <> 0 then raise exception 'B deleted another org''s brand'; end if;
    exception when insufficient_privilege then null;
    end;
  end if;
  -- moving a row out of the org is refused too
  begin
    update public.brands set org_id = a_org where org_id = b_org;
    raise exception 'FAILED: B moved a row into another org';
  exception when insufficient_privilege then null;
  end;

  -- B's rows can't point at A's, even knowing the ids
  if a_channel is not null then
    begin
      insert into public.brand_channels (brand_id, channel_id)
      select id, a_channel from public.brands where slug = 'shared-slug';
      raise exception 'FAILED: B linked its brand to another org''s channel';
    exception when foreign_key_violation then null;
    end;
  end if;
  if a_brand is not null then
    begin
      insert into public.products (brand_id, name, slug) values (a_brand, 'Sneaky', 'sneaky');
      raise exception 'FAILED: B added a product to another org''s brand';
    exception when foreign_key_violation then null;
    end;
  end if;
  begin
    insert into public.people (name, slug, user_id) values ('Sneaky', 'sneaky', a_user);
    raise exception 'FAILED: B linked a person to someone outside its org';
  exception when foreign_key_violation then null;
  end;

  -- --- as A: B's rows aren't there, and A's are ------------------------------------------------
  perform set_config('request.jwt.claims', be_a, true);
  foreach t in array tables loop
    execute format('select count(*) from public.%I where org_id = %L', t, b_org) into n;
    if n <> 0 then raise exception 'A can read % rows of % from org B', n, t; end if;
  end loop;
  if (select count(*) from public.settings) <> 1 then raise exception 'A should see exactly its own settings'; end if;
  if (select count(*) from public.profiles where id = b_user) <> 0 then raise exception 'A can read B''s profile'; end if;
  if a_brand is not null and (select count(*) from public.brands where id = a_brand) <> 1 then raise exception 'A lost sight of its own brand'; end if;

  perform set_config('role', 'postgres', true);
  raise notice 'org isolation: all checks passed';
end $$;

rollback;
