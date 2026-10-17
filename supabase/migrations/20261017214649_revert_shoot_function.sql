-- Revert a started (shooting) or ended (filmed) shoot to planned, as if it never started: ticks,
-- skips and b-roll counts cleared, the upload request removed (the stamp trigger clears who
-- started / ended it). The app then removes the shoot's shoot_clips rows.
-- Runs as the caller, so RLS still decides who can do it (any allowlisted user, like ending).
create function public.revert_shoot(p_shoot_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.shoots s where s.id = p_shoot_id and s.status in ('shooting', 'filmed')) then
    raise exception 'Only a shoot that has started can be reverted';
  end if;
  update public.shoot_items set status = 'planned' where shoot_id = p_shoot_id and status <> 'planned';
  update public.broll_shots set status = 'planned', clips_filmed = 0 where shoot_id = p_shoot_id and (status <> 'planned' or clips_filmed <> 0);
  update public.shoots set status = 'planned', upload_requested_at = null, upload_requested_by = null where id = p_shoot_id;
end $$;

revoke all on function public.revert_shoot(uuid) from public, anon;
grant execute on function public.revert_shoot(uuid) to authenticated, service_role;
