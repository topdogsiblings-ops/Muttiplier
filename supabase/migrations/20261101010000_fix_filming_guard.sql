-- The filming guard read every table's columns in one expression, so it errored for members on any
-- table without clips_filmed: they couldn't tick a shot or add a clip on any shoot. Each table now
-- only reads its own columns.
create or replace function private.guard_unstarted_filming() returns trigger
language plpgsql set search_path = '' as $$
declare
  filming boolean;
begin
  if (select auth.uid()) is null or private.is_org_admin(new.org_id) then
    return new;
  end if;
  if tg_table_name = 'shoot_clips' then
    filming := true;
  elsif tg_table_name = 'broll_shots' then
    filming := new.status = 'filmed' or new.clips_filmed > old.clips_filmed;
  else
    filming := new.status = 'filmed';
  end if;
  if filming and (select s.status from public.shoots s where s.id = new.shoot_id) in ('draft', 'planned') then
    raise exception 'An admin has to start the shoot before filming';
  end if;
  return new;
end $$;
