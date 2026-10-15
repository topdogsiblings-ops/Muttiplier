-- B-roll is ticked off clip by clip on set: a shot is filmed once its required clips are in.
alter table public.broll_shots
  add column clips_filmed int not null default 0 check (clips_filmed >= 0);

-- shots already ticked off count as having all their clips
update public.broll_shots set clips_filmed = min_clips where status = 'filmed';
