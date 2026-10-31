-- Example lines for every format, and the standalone formats the 2025–26 creative benchmarks
-- found strongest in the pet category. Standalone formats open and close themselves: a "hook"
-- beat first and a "cta" beat last. Lines are dog-neutral ("my dog") and promise nothing.
-- Already applied by hand on the live project; safe to run again.

-- --- example lines for the modular formats ------------------------------------------------
update public.formats set beat_examples = v.examples::jsonb
from (values
  ('F01', '{"problem": "Every walk, my dog pulled so hard my arm ached.", "product": "Then I tried {{product}}, and it took two minutes to set up.", "result": "Now walks are the best part of our day."}'),
  ('F02', '{"problem": "I honestly didn''t think anything would help my dog settle at night.", "product": "A friend told me about {{product}}, so I gave it a go.", "result": "A few weeks in, bedtime is so much calmer."}'),
  ('F03', '{"setup": "Here''s everything you need: {{product}} and one very curious dog.", "demo": "Pop it open, give it a shake, and watch.", "result": "And that''s it: done in under a minute."}'),
  ('F04', '{"before": "This was my dog''s bed last month.", "product": "One thing changed: {{product}}.", "after": "And this is the same bed today."}'),
  ('F05', '{"tip": "If your dog gets bored at dinner, try this.", "product": "I put their food in {{product}} instead of the bowl.", "payoff": "Ten whole minutes of happy, busy dog."}'),
  ('F06', '{"routine": "Seven a.m., and someone is very ready for their walk.", "product": "Breakfast comes with {{product}} now.", "wind-down": "By evening, we''re both done for the day."}'),
  ('F07', '{"arrival": "Look what just turned up at the door.", "product reveal": "Inside: {{product}}, and look at the quality of this.", "reaction": "I think that''s a yes from my dog."}'),
  ('F08', '{"feature": "This is the one thing that made me switch to {{product}}.", "demo": "Watch: it does this, so I don''t have to.", "result": "That''s why it''s my go-to now."}'),
  ('F09', '{"myth": "Myth: short-haired dogs don''t need brushing.", "truth": "Actually, short coats shed just as much.", "product": "So I brush with {{product}} twice a week."}'),
  ('F10', '{"target": "Gift idea for the person who spoils their dog rotten.", "product": "{{product}}, because it gets used every single day.", "reaction": "Safe to say they loved it."}'),
  ('F11', '{"morning": "Our mornings start before the alarm.", "product": "Two {{product}} with breakfast, every day.", "result": "It''s the easiest part of our routine."}'),
  ('F12', '{"day one": "Day one of trying {{product}} with my dog.", "product": "One a day with breakfast, that''s all.", "check-in": "Three weeks in, here''s what I''ve noticed so far."}')
) as v(code, examples)
where public.formats.code = v.code;

-- --- standalone formats --------------------------------------------------------------------
-- (Native search and text thread are treatments, not formats; a sign is a hook type. Earlier
-- drafts of these formats are removed.)
delete from public.formats f
where f.code in ('F13', 'F14', 'F15') and f.name in ('Text Thread', 'Native Search', 'Sign')
  and not exists (select 1 from public.body_templates b where b.format_id = f.id)
  and not exists (select 1 from public.shoot_formats s where s.format_id = f.id);

insert into public.formats (code, name, kind, description, beats, beat_descriptions, beat_examples, beat_display, beat_broll, target_seconds)
values
(
  'F16', 'Then & Now', 'standalone',
  'Nostalgia: the dog as a puppy then, and now, with the product as part of who they are today. Uses old footage of the dog. Pairs with the then/now labels treatment once treatments exist.',
  array['hook', 'then', 'now', 'product', 'cta'],
  '{"hook": "Set up the then-and-now: how long you''ve had your dog, or how small they used to be.", "then": "Over old footage: a memory from puppyhood.", "now": "Over today''s footage: who they are now.", "product": "How the product fits into their life now.", "cta": "To camera: one warm line and where to find it."}',
  '{"hook": "This is my dog then… and this is my dog now.", "then": "She used to fit in one hand and chewed everything.", "now": "Now she''s the calmest one in the house.", "product": "And {{product}} is part of her every morning.", "cta": "Here''s to many more years. It''s linked below."}',
  '{"hook": "face", "then": "broll", "now": "broll", "product": "broll", "cta": "face"}',
  '{"then": [{"description": "Old footage or photos of the dog as a puppy"}], "now": [{"description": "The same spot or moment, recreated with the dog today"}], "product": [{"description": "The dog enjoying the product today"}]}',
  15
),
(
  'F17', 'ASMR', 'standalone',
  'Sound first: the crunch, the pour, the chewing. Very few words, close-up sound and the dog enjoying it.',
  array['hook', 'sounds', 'product', 'cta'],
  '{"hook": "A whisper or a single line that tells people to turn the sound up.", "sounds": "Let the sounds carry it: crunching, pouring, chewing. A word or two at most.", "product": "One quiet line naming the product.", "cta": "A soft line to camera."}',
  '{"hook": "Sound on for this one.", "sounds": "Listen to that crunch.", "product": "{{product}}. Her favourite sound in the world.", "cta": "Linked below, if your dog wants in."}',
  '{"hook": "face", "sounds": "broll", "product": "broll", "cta": "face"}',
  '{"sounds": [{"description": "Close-up of the product being poured or opened, recorded with clear sound"}, {"description": "Close-up of the dog crunching or chewing, sound on"}], "product": [{"description": "The product in hand, close up"}]}',
  15
),
(
  'F18', 'Dog''s POV', 'standalone',
  'Told in the dog''s voice, from the dog''s point of view: what their day is like and why the product matters to them.',
  array['hook', 'day', 'product', 'cta'],
  '{"hook": "The dog introduces itself or its problem, in its own voice.", "day": "A moment from the dog''s day, as the dog sees it.", "product": "The dog on the product: why it''s the best part of the day.", "cta": "The dog asks the viewer to get it for their dog too."}',
  '{"hook": "Hi, I''m the dog. Let me tell you about my human.", "day": "Every morning she makes coffee before my breakfast. Rude.", "product": "But then: {{product}}. Worth the wait.", "cta": "Tell your human. It''s linked below."}',
  '{"hook": "broll", "day": "broll", "product": "broll", "cta": "broll"}',
  '{"hook": [{"description": "Low, dog''s-eye-level shot looking up at the owner"}], "day": [{"description": "The dog waiting in the kitchen, filmed at its eye level"}], "product": [{"description": "The dog getting the product"}], "cta": [{"description": "The dog looking straight into the camera"}]}',
  15
),
(
  'F19', 'Behind the Scenes', 'standalone',
  'What filming with your dog is really like: the setup, the chaos, and the one real moment, with the product in it.',
  array['hook', 'setup', 'reality', 'cta'],
  '{"hook": "Promise the real version: what it''s actually like filming with your dog.", "setup": "The plan: what you were trying to film.", "reality": "What actually happened, and the product winning the dog over.", "cta": "To camera: the honest verdict and where to find it."}',
  '{"hook": "Here''s what filming an ad with my dog actually looks like.", "setup": "The plan: one calm shot of her with {{product}}.", "reality": "Take forty-seven: she ate it before I hit record.", "cta": "She clearly approves. It''s linked below."}',
  '{"hook": "face", "setup": "broll", "reality": "broll", "cta": "face"}',
  '{"setup": [{"description": "The phone on a tripod and the scene being set up"}], "reality": [{"description": "Outtakes: the dog doing anything but the shot"}, {"description": "The dog going straight for the product"}]}',
  15
)
on conflict (code) do nothing;

-- I'm Returning This: reverse psychology, built on the brand's current offer ({{offer}}, filled on the shoot)
insert into public.formats (code, name, kind, description, beats, beat_descriptions, beat_examples, beat_display, beat_broll, target_seconds)
values (
  'F20', 'I''m Returning This', 'standalone',
  'Reverse psychology: you''re returning it. Not because of anything wrong with it (list the features as if they were complaints), but because there''s a big sale on and you can save even more. Only use an offer the brand has confirmed: fill {{offer}} on the shoot.',
  array['hook', 'not because', 'real reason', 'cta'],
  '{"hook": "Hold the product up and say you''re returning it. Deadpan: it should sound like a complaint.", "not because": "Two or three of its best features, said as if they were the reasons people return things: \"not because…, not because…\".", "real reason": "The twist: you''re returning it because there''s a sale on and you''ll save even more, so you''re stocking up.", "cta": "To camera: the offer and where to get it, before it ends."}',
  '{"hook": "I''m returning this.", "not because": "Not because my dog won''t stop asking for it. Not because it''s everything in one chew.", "real reason": "It''s because {{offer}}, so I''m buying three more and saving even more.", "cta": "The sale won''t last. The link''s right here."}',
  '{"hook": "face", "not because": "broll", "real reason": "face", "cta": "face"}',
  '{"hook": [{"description": "Holding the product up to camera, deadpan"}], "not because": [{"description": "The dog asking for the product"}, {"description": "Close-up of the product and what''s in it"}], "real reason": [{"description": "Several packs of the product on the counter"}]}',
  15
)
on conflict (code) do nothing;

-- Sign is a hook type: the hook delivered on a handwritten sign
insert into public.angles (name, description) values
  ('Sign', 'The hook is delivered on a handwritten sign held up to camera (by you, or on the dog''s collar), read out as it''s revealed. Film it: write the hook line big and clear on card.')
on conflict (name) do nothing;
