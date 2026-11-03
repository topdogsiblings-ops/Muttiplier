-- Only admins change a shoot's status or run its batches, and members can't film before an admin
-- starts the shoot. Raises on the first failure, and rolls everything back either way.
-- Run it in the Supabase SQL editor, or with psql against the project.

begin;

do $$
declare
  org uuid := (select id from public.orgs where slug = 'topdogugc');
  admin_user uuid := (select user_id from public.org_members where org_id = (select id from public.orgs where slug = 'topdogugc') and role = 'admin' limit 1);
  member_user uuid := (select user_id from public.org_members where org_id = (select id from public.orgs where slug = 'topdogugc') and role = 'member' limit 1);
  a_shoot uuid := (select id from public.shoots where org_id = (select id from public.orgs where slug = 'topdogugc') order by code desc limit 1);
  a_item uuid;
  a_shot uuid;
  n bigint;
  be_admin text := json_build_object('sub', admin_user, 'role', 'authenticated')::text;
  be_member text := json_build_object('sub', member_user, 'role', 'authenticated')::text;
begin
  if a_shoot is null or member_user is null then
    raise exception 'Needs a shoot and a member to test with';
  end if;
  update public.shoots set status = 'planned' where id = a_shoot;
  select id into a_item from public.shoot_items where shoot_id = a_shoot limit 1;
  select id into a_shot from public.broll_shots where shoot_id = a_shoot limit 1;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', be_member, true);

  -- a member can't start the shoot, or any other status change
  begin
    update public.shoots set status = 'shooting' where id = a_shoot;
    raise exception 'FAILED: a member started a shoot';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;
  begin
    perform public.revert_shoot(a_shoot);
  exception when raise_exception then null;
  end;
  if (select status from public.shoots where id = a_shoot) <> 'planned' then
    raise exception 'FAILED: a member moved a shoot''s status';
  end if;

  -- or mark it stale, or renumber it
  begin
    update public.shoots set stale_at = now() where id = a_shoot;
    raise exception 'FAILED: a member marked a shoot stale';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;
  begin
    perform public.renumber_shoot_items(a_shoot);
    raise exception 'FAILED: a member renumbered a shoot';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;

  -- or film before it's started, though they can skip a shot
  if a_item is not null then
    begin
      update public.shoot_items set status = 'filmed' where id = a_item;
      raise exception 'FAILED: a member filmed before the shoot started';
    exception when raise_exception then
      if sqlerrm like 'FAILED%' then raise; end if;
    end;
    update public.shoot_items set status = 'skipped' where id = a_item;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAILED: a member couldn''t skip a shot'; end if;
    update public.shoot_items set status = 'planned' where id = a_item;
  end if;

  -- the same for b-roll and clips
  if a_shot is not null then
    begin
      update public.broll_shots set clips_filmed = clips_filmed + 1 where id = a_shot;
      raise exception 'FAILED: a member added b-roll before the shoot started';
    exception when raise_exception then
      if sqlerrm like 'FAILED%' then raise; end if;
    end;
  end if;
  begin
    insert into public.shoot_clips (shoot_id, target, file_name, size, state) values (a_shoot, 'item:test', 'test.mov', 1, 'saved');
    raise exception 'FAILED: a member added a clip before the shoot started';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;

  -- or make a batch
  begin
    insert into public.shoot_shortlists (shoot_id, code, size, entry_ids) values (a_shoot, 'B99', 1, '{test}');
    raise exception 'FAILED: a member made a batch';
  exception when insufficient_privilege then null;
  end;

  -- an admin can do all of it, and then the member can film
  perform set_config('request.jwt.claims', be_admin, true);
  update public.shoots set stale_at = now() where id = a_shoot;
  update public.shoots set stale_at = null where id = a_shoot;
  begin
    perform public.renumber_shoot_items(a_shoot);
  exception when raise_exception then
    -- codes are frozen once a shoot is planned: that's the draft rule, not the admin one
    if sqlerrm like 'Only an admin%' then raise exception 'FAILED: an admin couldn''t renumber'; end if;
  end;
  update public.shoots set status = 'shooting' where id = a_shoot;
  insert into public.shoot_shortlists (shoot_id, code, size, entry_ids) values (a_shoot, 'B99', 1, '{test}');
  update public.shoot_shortlists set status = 'rendering', status_at = now() where shoot_id = a_shoot and code = 'B99';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAILED: an admin couldn''t move a batch on'; end if;

  perform set_config('request.jwt.claims', be_member, true);
  if a_item is not null then
    update public.shoot_items set status = 'filmed' where id = a_item;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAILED: a member couldn''t film a started shoot'; end if;
  end if;
  if a_shot is not null then
    update public.broll_shots set clips_filmed = clips_filmed + 1 where id = a_shot;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAILED: a member couldn''t add b-roll to a started shoot'; end if;
  end if;
  insert into public.shoot_clips (shoot_id, target, file_name, size, state) values (a_shoot, 'item:test', 'test.mov', 1, 'saved');
  begin
    update public.shoot_shortlists set status = 'submitted' where shoot_id = a_shoot and code = 'B99';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAILED: a member moved a batch on'; end if;
  exception when insufficient_privilege then null;
  end;

  perform set_config('role', 'postgres', true);
  raise notice 'admins run shoots: all checks passed';
end $$;

rollback;
