-- Reverting a shoot to planned clears who started / ended it and records when it was reverted
-- (spec §10a). Phones drop clips they saved before `reverted_at`.
alter table public.shoots add column reverted_at timestamptz;

create or replace function private.stamp_shoot_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'shooting' and old.status = 'planned' then
      new.started_at := now();
      new.started_by := auth.uid();
    elsif new.status = 'shooting' and old.status = 'filmed' then
      -- resumed: still the same shoot, so it keeps its start and gets a new end later
      new.started_at := old.started_at;
      new.started_by := old.started_by;
      new.ended_at := null;
      new.ended_by := null;
    elsif new.status = 'filmed' and old.status in ('planned', 'shooting') then
      new.started_at := coalesce(old.started_at, now());
      new.started_by := coalesce(old.started_by, auth.uid());
      new.ended_at := now();
      new.ended_by := auth.uid();
    elsif new.status = 'planned' and old.status in ('shooting', 'filmed') then
      -- reverted: as if it never started
      new.started_at := null;
      new.started_by := null;
      new.ended_at := null;
      new.ended_by := null;
      new.reverted_at := now();
    end if;
  else
    -- only the status change may set these
    new.started_at := old.started_at;
    new.started_by := old.started_by;
    new.ended_at := old.ended_at;
    new.ended_by := old.ended_by;
    new.reverted_at := old.reverted_at;
  end if;
  return new;
end $$;
