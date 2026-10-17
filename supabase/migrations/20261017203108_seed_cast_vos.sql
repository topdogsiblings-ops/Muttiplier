-- Starter VOs written for each person on the cast: one per starter format (F01–F05) for
-- Mak, Bren and Joe. Universal (no products), dog-neutral, built-in slots only, no claims.
--
-- Uses the people already in Settings → People and never adds any: each VO goes to the person
-- whose slug or name is, or starts with, mak / bren / joe (e.g. Makayla, Brennen); a VO with no
-- such person is skipped. The beats below are written for the starter formats, so a format whose
-- beats have been changed since is skipped too, rather than saving mismatched beats.

insert into public.body_templates (format_id, person_id, title, angle_id, beats, est_seconds, tags)
select f.id, p.id, v.title, a.id, v.beats::jsonb,
  (select ceil(count(word) / coalesce((select s.words_per_second from public.settings s limit 1), 2.5))::int
     from jsonb_array_elements(v.beats::jsonb) as beat
     cross join lateral regexp_split_to_table(trim(beat ->> 'script'), '\s+') as word
     where word <> ''),
  v.tags::text[]
from (values
  -- Mak
  ('mak', 'F01', 'The 6am zoomies', 'Problem',
    '[{"beat":"problem","script":"Every single morning at six, my dog decides the living room is a racetrack. Sofa cushions everywhere, and the coffee isn''t even made yet."},{"beat":"product","script":"So I started giving them {{product}} first thing, before I even put the kettle on."},{"beat":"result","script":"Now mornings start calm. I actually drink my coffee hot, and the cushions stay on the sofa."}]',
    '{morning,routine}'),
  ('mak', 'F02', 'I nearly didn''t bother', 'Skeptic',
    '[{"beat":"problem","script":"I''ve bought so many things for my dog that ended up in a drawer. I wasn''t about to get excited about another one."},{"beat":"product","script":"But {{brand}} kept popping up, so I tried {{product}}. Honestly? It was part of our routine by day three."},{"beat":"result","script":"Weeks later it''s still the first thing my dog runs to. That never happens in this house."}]',
    '{review}'),
  ('mak', 'F03', 'The kitchen test', 'Demo',
    '[{"beat":"setup","script":"Right, here''s {{product}}. Let''s see if it passes the kitchen test."},{"beat":"demo","script":"I''m just going to set it down and step back. No coaching, no bribes."},{"beat":"result","script":"And there we go. That''s the fastest approval I''ve ever had."}]',
    '{first-try}'),
  ('mak', 'F04', 'Sunday chaos', 'POV',
    '[{"beat":"before","script":"Sundays used to be chaos. A bored dog, chewed shoes, and me hiding in the kitchen."},{"beat":"product","script":"Then {{product}} came into the picture."},{"beat":"after","script":"Now Sunday is the slowest, comfiest day of the week. For both of us."}]',
    '{weekend,home}'),
  ('mak', 'F05', 'Tip: the two-minute reset', 'Curiosity',
    '[{"beat":"tip","script":"Tip: when your dog gets wound up, give them a two-minute reset before anything else."},{"beat":"product","script":"Ours is {{product}}. Quiet corner, no fuss."},{"beat":"payoff","script":"Two minutes later, a completely different dog."}]',
    '{tips,calm}'),
  -- Bren
  ('bren', 'F01', 'Rainy-day cabin fever', 'Problem',
    '[{"beat":"problem","script":"When it rains for a week, my dog gets cabin fever, and so do I. Pacing, sighing, staring at the door."},{"beat":"product","script":"That''s when {{product}} comes out. It''s become our rainy-day plan."},{"beat":"result","script":"Same rain outside, but inside it''s calm again. I''ll take that."}]',
    '{weather,home}'),
  ('bren', 'F02', 'My sister was right', 'Testimonial',
    '[{"beat":"problem","script":"My sister has had dogs her whole life, and she kept telling me I was overcomplicating things."},{"beat":"product","script":"Her one recommendation was {{product}} from {{brand}}. So I finally listened."},{"beat":"result","script":"She was right, which I''ll never say to her face. It just works for us, every day."}]',
    '{recommendation}'),
  ('bren', 'F03', 'First go, no edits', 'POV',
    '[{"beat":"setup","script":"First time trying {{product}}, and I''m filming the whole thing, no edits."},{"beat":"demo","script":"Here''s how we use it. It takes about ten seconds."},{"beat":"result","script":"Okay, I didn''t expect that reaction. We''re keeping it."}]',
    '{first-try}'),
  ('bren', 'F04', 'The lead-pulling era', 'Problem',
    '[{"beat":"before","script":"This was us a month ago. Pulling, zig-zagging, and me apologising to every neighbour."},{"beat":"product","script":"We added {{product}} to our walks."},{"beat":"after","script":"And this is us now. Same street, much happier walk."}]',
    '{walks}'),
  ('bren', 'F05', 'Tip: tire the brain too', 'Contrarian',
    '[{"beat":"tip","script":"Unpopular opinion: a longer walk isn''t always the answer. Tire out their brain too."},{"beat":"product","script":"We do that with {{product}}."},{"beat":"payoff","script":"Ten minutes of thinking beats an extra mile."}]',
    '{tips,enrichment}'),
  -- Joe
  ('joe', 'F01', 'The doorbell problem', 'Problem',
    '[{"beat":"problem","script":"In our house, the doorbell means five minutes of chaos. Barking, spinning, the full show."},{"beat":"product","script":"We started using {{product}} as part of how we handle visitors."},{"beat":"result","script":"Now the doorbell goes, there''s a look, and that''s about it. Our guests have noticed."}]',
    '{visitors,home}'),
  ('joe', 'F02', 'The family sceptic', 'Skeptic',
    '[{"beat":"problem","script":"I''m the sceptic in our family. Every new dog gadget gets an eye-roll from me."},{"beat":"product","script":"So when {{product}} from {{brand}} turned up, I gave it a week, fully expecting to be right."},{"beat":"result","script":"I wasn''t. It''s part of our day now, and I''m the one who reorders it."}]',
    '{review}'),
  ('joe', 'F03', 'Thirty-second setup', 'Demo',
    '[{"beat":"setup","script":"Here''s everything you get with {{product}}. Nothing complicated."},{"beat":"demo","script":"Thirty seconds and it''s ready. Watch who turns up the second it''s done."},{"beat":"result","script":"Never had a helper this keen. That''s a good sign."}]',
    '{unboxing}'),
  ('joe', 'F04', 'Evenings, then and now', 'Curiosity',
    '[{"beat":"before","script":"Evenings used to be me on the sofa and a dog who wanted anything but rest."},{"beat":"product","script":"We brought {{product}} into our evening routine."},{"beat":"after","script":"Now we both switch off at the same time. Best part of the day."}]',
    '{evening,routine}'),
  ('joe', 'F05', 'Tip: same time, every day', 'Curiosity',
    '[{"beat":"tip","script":"Quick tip: dogs love a routine, so do the small things at the same time every day."},{"beat":"product","script":"For us, {{product}} is part of that routine."},{"beat":"payoff","script":"Predictable days make for a much more relaxed dog."}]',
    '{tips,routine}')
) as v(person, format_code, title, angle, beats, tags)
join public.formats f on f.code = v.format_code
  and f.beats = (select array_agg(beat ->> 'beat' order by n) from jsonb_array_elements(v.beats::jsonb) with ordinality as b(beat, n))
join lateral (
  select p.id from public.people p
  where p.slug = v.person or lower(p.name) = v.person
     or p.slug like v.person || '%' or lower(p.name) like v.person || '%'
  -- an exact slug, then an exact name, then the closest prefix match; active people first
  order by (p.slug = v.person) desc, (lower(p.name) = v.person) desc, p.active desc, length(p.name)
  limit 1
) p on true
left join public.angles a on lower(a.name) = lower(v.angle)
-- safe to re-run
where not exists (
  select 1 from public.body_templates b
  where b.format_id = f.id and b.person_id = p.id and b.title = v.title
);
