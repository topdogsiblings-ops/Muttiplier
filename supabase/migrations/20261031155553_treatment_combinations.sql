-- Curated combinations: a treatment can be made of other treatments (its parts), e.g. a search
-- bar over the hook, then the VO face to camera. Each combination is deliberately set up in the
-- Library; nothing else combines. A combination applies where every part would.
alter table public.treatments
  add column parts uuid[] not null default '{}';
comment on column public.treatments.parts is 'A combination''s treatments (at most one layout part, each on a different part of the video). Empty = a single treatment.';

insert into public.treatments (name, description, kind, placement, needs, component, parts, sort_order)
select v.name, v.description, v.kind, 'video', v.needs, 'combo',
  array(select t.id from public.treatments t where t.name = any(v.part_names) order by array_position(v.part_names, t.name)),
  v.sort_order
from (values
  ('Search, then face to camera', 'Opens on a search bar typing the question the hook answers, then the VO plays with the speaker on camera answering it.', 'layout', array['speaker_video', 'text'], array['Search bar', 'Face to camera'], 30),
  ('Search, then over b-roll', 'Opens on a search bar typing the question, then the whole VO plays over footage.', 'layout', array['text'], array['Search bar', 'Over b-roll'], 31),
  ('Placed text, then face to camera', 'The hook line as large text in an unexpected spot, then the VO face to camera.', 'layout', array['speaker_video', 'text'], array['Unusual text placement', 'Face to camera'], 32),
  ('Search, then picture-in-picture', 'Opens on a search bar, then the VO over b-roll with the speaker in a corner box.', 'footage', array['speaker_video', 'text'], array['Search bar', 'Picture-in-picture'], 33)
) as v(name, description, kind, needs, part_names, sort_order)
on conflict (name) do nothing;

-- The offer badge is the editor's call (when the brand has a confirmed offer), not a treatment.
update public.treatments set archived = true, active = false where name = 'Offer badge';
