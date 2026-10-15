-- Speech pace used to estimate VO length from its script (about 150 words a minute).
alter table public.settings
  add column words_per_second numeric not null default 2.5 check (words_per_second > 0);

-- Existing VOs: estimated seconds = words across all beats / pace, rounded up.
-- Mirrors estimateSeconds() in shared/utils/slots.ts (a {{slot}} counts as one word).
update public.body_templates b
set est_seconds = ceil(w.words / 2.5)::int
from (
  select t.id, count(word) as words
  from public.body_templates t
  cross join lateral jsonb_array_elements(t.beats) as beat
  cross join lateral regexp_split_to_table(trim(coalesce(beat ->> 'script', '')), '\s+') as word
  where word <> ''
  group by t.id
) w
where w.id = b.id;
