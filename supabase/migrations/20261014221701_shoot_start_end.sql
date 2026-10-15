-- Shoots can be started and ended on set: planned -> shooting -> filmed.
-- Who started / ended a shoot, and when, is recorded by the database.
alter table public.shoots drop constraint shoots_status_check;
alter table public.shoots add constraint shoots_status_check check (
  status in ('draft', 'planned', 'shooting', 'filmed', 'edited', 'ingested', 'rendering', 'done')
);

alter table public.shoots
  add column started_at timestamptz,
  add column started_by uuid,
  add column ended_at timestamptz,
  add column ended_by uuid;

create function private.stamp_shoot_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'shooting' and old.status = 'planned' then
      new.started_at := now();
      new.started_by := auth.uid();
    elsif new.status = 'filmed' and old.status in ('planned', 'shooting') then
      new.started_at := coalesce(old.started_at, now());
      new.started_by := coalesce(old.started_by, auth.uid());
      new.ended_at := now();
      new.ended_by := auth.uid();
    end if;
  else
    -- only the status change may set these
    new.started_at := old.started_at;
    new.started_by := old.started_by;
    new.ended_at := old.ended_at;
    new.ended_by := old.ended_by;
  end if;
  return new;
end $$;

create trigger stamp_shoot_status before update on public.shoots
for each row execute function private.stamp_shoot_status();

revoke all on function private.stamp_shoot_status() from public, anon;
grant execute on function private.stamp_shoot_status() to authenticated, service_role;
