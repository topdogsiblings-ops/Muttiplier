-- Only an org's admins move a shoot through its statuses (planning it, starting and ending filming,
-- editing, going Live) and run its batches. Members plan and film: once an admin has started a
-- shoot they tick their shots off and add their clips, but not before.
-- Migrations and service jobs (no signed-in user) aren't held to this.

create function private.guard_shoot_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_org_admin(new.org_id) then
    return new;
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'A new shoot starts as a draft';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    raise exception 'Only an admin can change a shoot''s status';
  end if;
  return new;
end $$;
-- fires before stamp_shoot_status (triggers fire by name)
create trigger guard_shoot_status before insert or update of status on public.shoots
  for each row execute function private.guard_shoot_status();

-- Filming hasn't started until an admin starts it. Skipping a shot is planning, so it's still allowed.
create function private.guard_unstarted_filming() returns trigger
language plpgsql set search_path = '' as $$
declare
  filming boolean;
begin
  if (select auth.uid()) is null or private.is_org_admin(new.org_id) then
    return new;
  end if;
  filming := case tg_table_name
    when 'shoot_clips' then true
    when 'broll_shots' then new.status = 'filmed' or new.clips_filmed > old.clips_filmed
    else new.status = 'filmed'
  end;
  if filming and (select s.status from public.shoots s where s.id = new.shoot_id) in ('draft', 'planned') then
    raise exception 'An admin has to start the shoot before filming';
  end if;
  return new;
end $$;
create trigger guard_unstarted_filming before update of status on public.shoot_items
  for each row execute function private.guard_unstarted_filming();
create trigger guard_unstarted_filming before update of status, clips_filmed on public.broll_shots
  for each row execute function private.guard_unstarted_filming();
create trigger guard_unstarted_filming before insert on public.shoot_clips
  for each row execute function private.guard_unstarted_filming();

revoke all on function private.guard_shoot_status(), private.guard_unstarted_filming() from public, anon;
grant execute on function private.guard_shoot_status(), private.guard_unstarted_filming() to authenticated, service_role;

-- Manifests are written when editing starts and when a shoot goes Live.
alter policy "org members can insert" on public.shoot_manifests
  with check (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
alter policy "org members can insert" on public.shoot_manifests rename to "org admins can insert";

-- Batches. Their status could never be saved until now: nobody had permission to update them.
alter policy "org members can insert" on public.shoot_shortlists
  with check (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
alter policy "org members can insert" on public.shoot_shortlists rename to "org admins can insert";
create policy "org admins can update" on public.shoot_shortlists for update to authenticated
  using (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())))
  with check (org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id())));
grant update (status, status_at) on public.shoot_shortlists to authenticated;

-- Scoring a batch and dropping or keeping its elements.
do $$
declare
  t text;
  admin constant text := 'org_id = (select private.current_org_id()) and (select private.is_org_admin(private.current_org_id()))';
begin
  foreach t in array array['batch_scores', 'shoot_element_overrides'] loop
    execute format('alter policy "org members can insert" on public.%I with check (%s)', t, admin);
    execute format('alter policy "org members can insert" on public.%I rename to "org admins can insert"', t);
    execute format('alter policy "org members can update" on public.%I using (%s) with check (%s)', t, admin, admin);
    execute format('alter policy "org members can update" on public.%I rename to "org admins can update"', t);
    execute format('alter policy "org members can delete" on public.%I using (%s)', t, admin);
    execute format('alter policy "org members can delete" on public.%I rename to "org admins can delete"', t);
  end loop;
end $$;
