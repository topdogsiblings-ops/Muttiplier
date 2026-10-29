-- B-roll shots no longer say how many clips to film or whether the product is in frame: each
-- channel films as many clips of a shot as it likes, and recipes cover every beat by length.
-- Run after the app that stops writing these columns is deployed.
alter table public.broll_shots
  drop column min_clips,
  drop column product_visible;

-- suggested shots (on each format's beats, and general product shots in Settings) are just descriptions now
update public.formats f
set beat_broll = (
  select coalesce(jsonb_object_agg(beat, (
    select coalesce(jsonb_agg(shot - 'product_visible'), '[]'::jsonb) from jsonb_array_elements(shots) shot
  )), '{}'::jsonb)
  from jsonb_each(f.beat_broll) as b(beat, shots)
  where jsonb_typeof(shots) = 'array'
)
where f.beat_broll::text like '%product_visible%';

update public.settings
set general_broll = (select coalesce(jsonb_agg(shot - 'product_visible'), '[]'::jsonb) from jsonb_array_elements(general_broll) shot)
where general_broll::text like '%product_visible%';
