-- "Then & now labels" becomes "Retro look": Motion's Nostalgia format is a retro-era look (VHS
-- grain, throwback fonts), not the same subject then vs now. It needs nothing, so it can apply to
-- any recipe. The text thread becomes a standalone format of its own (planned), so its treatment
-- is archived. Already applied by hand on the live project; safe to run again.
update public.treatments set
  name = 'Retro look',
  description = 'A 90s / early-2000s look over the whole video: VHS grain, a camcorder date stamp and a throwback font for the captions. Motion''s "Nostalgia" format, the top pet format by hit rate (26%) in its 2025-26 benchmarks.',
  kind = 'overlay', placement = 'video', needs = '{}', component = 'retro_look',
  settings = '{"grain": "vhs", "date_stamp": true, "font": "90s"}'
where name = 'Then & now labels';

update public.treatments set archived = true, active = false where name = 'Text thread';
