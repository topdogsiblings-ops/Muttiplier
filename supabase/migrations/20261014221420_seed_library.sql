-- Starter Library: 5 formats, 10 bodies, 30 hooks, 15 CTAs.
-- Brand-agnostic templates using only the built-in slots ({{brand}}, {{product}}, {{dog}}).
-- Bodies and CTAs stay dog-neutral so every channel can share them. No product claims.

insert into public.formats (code, name, description, cta_modes, beats, target_seconds) values
  ('F01', 'Problem → Solution', 'Name a relatable problem, introduce the product, show the result.', '{sync,vo}', '{problem,product,result}', 25),
  ('F02', 'Testimonial Story', 'A first-hand story: what life was like, trying the product, how it went.', '{sync,vo}', '{problem,product,result}', 30),
  ('F03', 'Demo Walkthrough', 'Show the product being used, start to finish.', '{sync,vo}', '{setup,demo,result}', 20),
  ('F04', 'Before & After', 'A clear contrast between before and after the product.', '{sync}', '{before,product,after}', 20),
  ('F05', 'Quick Tip', 'A useful dog-owner tip, with the product as part of it.', '{vo}', '{tip,product,payoff}', 15);

insert into public.body_templates (format_id, title, angle_id, beats, est_seconds, tags)
select f.id, b.title, a.id, b.beats::jsonb, b.est_seconds, b.tags::text[]
from (values
  ('F01', 'Restless evenings', 'Problem',
    '[{"beat":"problem","script":"Every evening my dog just couldn''t settle. Pacing, whining, the lot."},{"beat":"product","script":"So we started using {{product}} as part of our wind-down routine."},{"beat":"result","script":"Now evenings are calmer, and honestly, so am I."}]',
    22, '{evening,routine}'),
  ('F01', 'Walk-time chaos', 'Problem',
    '[{"beat":"problem","script":"Walks used to feel like a tug of war from the second we left the house."},{"beat":"product","script":"We gave {{product}} a go, and it slotted straight into our routine."},{"beat":"result","script":"Now walks are actually the best part of my day."}]',
    20, '{walks}'),
  ('F02', 'Picky eater', 'Testimonial',
    '[{"beat":"problem","script":"My dog is the fussiest eater I''ve ever met. Half a bowl, every single time."},{"beat":"product","script":"A friend told me about {{product}} from {{brand}}, so I gave it a shot."},{"beat":"result","script":"Bowl licked clean, every day since."}]',
    24, '{food,fussy}'),
  ('F02', 'Honest month review', 'Skeptic',
    '[{"beat":"problem","script":"I''ll be honest, I didn''t expect much when I ordered {{product}}."},{"beat":"product","script":"But a month in, it''s become part of our everyday routine."},{"beat":"result","script":"It''s earned its spot, and I''d buy it again."}]',
    22, '{review}'),
  ('F03', 'Unboxing and first try', 'Demo',
    '[{"beat":"setup","script":"Here''s {{product}}, straight out of the box."},{"beat":"demo","script":"Let''s give it to my dog and see what happens."},{"beat":"result","script":"And that''s a yes from the toughest critic in the house."}]',
    18, '{unboxing}'),
  ('F03', 'Our morning routine', 'POV',
    '[{"beat":"setup","script":"This is how {{product}} fits into our mornings."},{"beat":"demo","script":"It takes seconds, and my dog knows exactly what''s coming."},{"beat":"result","script":"Easy for me, exciting for them. That''s a win."}]',
    18, '{routine,morning}'),
  ('F04', 'Bath-time battle', 'Problem',
    '[{"beat":"before","script":"Bath time used to mean soaked floors and a very unhappy pup."},{"beat":"product","script":"Then we switched to {{product}}."},{"beat":"after","script":"Now? Still a little dramatic, but so much easier."}]',
    16, '{grooming}'),
  ('F04', 'Bored at home', 'Curiosity',
    '[{"beat":"before","script":"When I worked from home, my dog was bored out of their mind."},{"beat":"product","script":"{{product}} keeps them busy while I get things done."},{"beat":"after","script":"Happy dog, quiet house, productive me."}]',
    16, '{enrichment,home}'),
  ('F05', 'Tip: calm goodbyes', 'Contrarian',
    '[{"beat":"tip","script":"Here''s a tip: don''t make a big fuss when you leave the house."},{"beat":"product","script":"Give them something to focus on instead. We use {{product}}."},{"beat":"payoff","script":"Calm goodbyes make for calmer days."}]',
    14, '{tips,alone-time}'),
  ('F05', 'Tip: mix up the walk', 'Curiosity',
    '[{"beat":"tip","script":"Quick tip: mix up your walking route every few days."},{"beat":"product","script":"And bring {{product}} along to keep things interesting."},{"beat":"payoff","script":"A curious dog is a happy dog."}]',
    12, '{tips,walks}')
) as b(format_code, title, angle, beats, est_seconds, tags)
join public.formats f on f.code = b.format_code
left join public.angles a on a.name = b.angle;

insert into public.hook_templates (script, angle_id, is_universal, est_seconds, tags, caption, filming_notes)
select h.script, a.id, h.is_universal, h.est_seconds, h.tags::text[], h.caption, h.filming_notes
from (values
  -- Curiosity
  ('Nobody warned me about this when I got {{dog}}.', 'Curiosity', true, 3, '{first-time-owner}', 'The things they don''t tell you 🐾 #dogsoftiktok #dogowner', 'Straight to camera, slightly conspiratorial. Dog in the background.'),
  ('I didn''t expect {{product}} to change our mornings this much.', 'Curiosity', false, 3, '{routine,morning}', 'Mornings, upgraded ☀️ #dogmom #morningroutine', null),
  ('This is the one thing I''d buy again for {{dog}}.', 'Curiosity', false, 3, '{favourites}', 'No notes. Would buy again. #dogfinds #dogsoftiktok', 'Hold the product up to camera on "this".'),
  ('Watch what {{dog}} does the second I open this cupboard.', 'Curiosity', true, 3, '{reaction}', 'Every. Single. Time. 😂 #dogsoftiktok #funnydogs', 'Camera on the dog, owner''s hand opens the cupboard in frame. Capture the reaction.'),
  ('Okay, I finally get why everyone''s talking about {{brand}}.', 'Curiosity', false, 3, '{hype}', 'Okay I get it now 👀 #dogfinds', null),
  -- Problem
  ('If your dog does this on walks, keep watching.', 'Problem', true, 3, '{walks}', 'Walks don''t have to be a battle 🦮 #dogtraining #dogwalk', 'Open on the dog pulling on the lead, then turn to camera.'),
  ('{{dog}} used to dread bath time. Then we found {{product}}.', 'Problem', false, 4, '{grooming}', 'Bath time, solved 🛁 #doggrooming', null),
  ('Every dog owner knows this sound at 3am.', 'Problem', true, 3, '{night,relatable}', 'If you know, you know 😴 #dogowner #relatable', 'Dim, night-time lighting. Whisper the line.'),
  ('I was spending a fortune on stuff {{dog}} ignored, until {{product}}.', 'Problem', false, 4, '{toys,value}', 'Finally, one they actually use 🙌 #dogfinds', 'Pile of unused toys in frame, then push them aside.'),
  ('Is your dog bored, or is it just me?', 'Problem', true, 2, '{enrichment}', 'Bored dog = chaos dog 🙃 #dogenrichment', null),
  -- Testimonial
  ('Three weeks with {{product}}, and here''s my honest take.', 'Testimonial', false, 3, '{review}', 'My honest review 📝 #dogproductreview', 'Sit-down, natural light, relaxed tone.'),
  ('I''ve tried everything for {{dog}}. This is what actually stuck.', 'Testimonial', false, 4, '{review}', 'The one that actually stuck ✅ #dogowner', null),
  ('My honest review of {{product}} after a month with {{dog}}.', 'Testimonial', false, 3, '{review}', 'One month in. Here''s the truth 👇 #dogproductreview', 'Product on the table in front of you.'),
  ('Things I wish I''d known before getting {{dog}}.', 'Testimonial', true, 3, '{first-time-owner}', 'Save this if you''re getting a dog 📌 #newdogowner', null),
  -- POV
  ('POV: {{dog}} hears the treat bag from three rooms away.', 'POV', true, 3, '{treats,funny}', 'Supersonic hearing, selective listening 🙉 #dogsoftiktok', 'Rustle the bag off camera; dog runs into frame.'),
  ('POV: you finally found something {{dog}} actually loves.', 'POV', false, 3, '{favourites}', 'Finally 🥹 #dogmom #dogdad', null),
  ('POV: it''s 6am and {{dog}} has decided it''s walk time.', 'POV', true, 3, '{morning,funny}', 'Who needs an alarm 🐕⏰ #dogsoftiktok', 'Shoot from bed, dog''s face close to camera.'),
  ('POV: you open the {{brand}} box and {{dog}} won''t leave you alone.', 'POV', false, 3, '{unboxing}', 'They knew 📦🐶 #unboxing #dogsoftiktok', 'Overhead shot of the box opening, dog nosing in.'),
  -- Skeptic
  ('I honestly thought {{product}} was a gimmick.', 'Skeptic', false, 2, '{review}', 'I was wrong 🙈 #dogproductreview', 'Arms crossed, sceptical face, then glance at the product.'),
  ('I didn''t believe the hype around {{brand}}. So I tested it on {{dog}}.', 'Skeptic', false, 4, '{hype,review}', 'Putting it to the test 🧪 #dogfinds', null),
  ('I rolled my eyes at this too, until I tried it with {{dog}}.', 'Skeptic', true, 3, '{review}', 'Okay fine, you win 🙄 #dogowner', 'Literally roll your eyes on "rolled my eyes".'),
  ('Is {{product}} worth it? Let''s find out with {{dog}}.', 'Skeptic', false, 3, '{review}', 'Worth it? Let''s see 👀 #dogproductreview', null),
  -- Contrarian
  ('Stop doing this with your dog. Seriously.', 'Contrarian', true, 2, '{tips}', 'Do this instead 👇 #dogtips', 'Firm delivery, point at camera on "stop".'),
  ('Unpopular opinion: {{dog}} doesn''t need more toys. It needs {{product}}.', 'Contrarian', false, 4, '{toys}', 'Unpopular opinion, but hear me out 🗣️ #dogowner', null),
  ('Everyone says tire your dog out. Here''s what worked for us instead.', 'Contrarian', true, 4, '{tips,enrichment}', 'Not what you''d expect 🤔 #dogtips', null),
  ('You don''t need a complicated routine. You need {{product}}.', 'Contrarian', false, 3, '{routine}', 'Keep it simple ✨ #dogowner', null),
  -- Demo
  ('Here''s exactly how we use {{product}} with {{dog}}.', 'Demo', false, 3, '{how-to}', 'How we use it 👇 #dogfinds', 'Product already in hand, start the demo on the last word.'),
  ('Watch {{dog}} try {{product}} for the very first time.', 'Demo', false, 3, '{first-try,reaction}', 'First try… the verdict? 🐶 #dogreaction', 'One continuous take of the dog''s first reaction. Don''t cut.'),
  ('Let me show you how easy {{product}} is to set up.', 'Demo', false, 3, '{how-to,setup}', 'Easy as that 🙌 #dogfinds', null),
  ('Here''s a ten-second trick {{dog}} and I do every day.', 'Demo', true, 3, '{tips,routine}', 'Our daily ritual 🐾 #dogtips', 'Start the trick as you say "ten-second".')
) as h(script, angle, is_universal, est_seconds, tags, caption, filming_notes)
left join public.angles a on a.name = h.angle;

insert into public.cta_templates (script, mode, est_seconds, tags) values
  ('Tap the link and try {{product}} for yourself.', 'sync', 3, '{link}'),
  ('If your dog would love this, the link is right below.', 'sync', 3, '{link}'),
  ('Go check out {{brand}}. You can thank me later.', 'sync', 3, '{brand}'),
  ('Grab {{product}} using the link, and tell me how it goes.', 'sync', 3, '{link,engagement}'),
  ('Save this for later, then go get {{product}}.', 'sync', 3, '{save}'),
  ('Your dog deserves this. Link''s below.', 'sync', 2, '{link}'),
  ('Try {{product}} and see the difference for yourself.', 'sync', 3, '{try}'),
  ('Honestly, just try it. Link''s right here.', 'sync', 2, '{link}'),
  ('{{product}} from {{brand}}. Tap the link to get yours.', 'vo', 3, '{link}'),
  ('Tap below to try {{product}} with your dog.', 'vo', 3, '{link}'),
  ('Find {{product}} at the link below.', 'vo', 2, '{link}'),
  ('Give your dog the {{brand}} upgrade. Link below.', 'vo', 3, '{link,brand}'),
  ('Ready to try it? {{product}} is one tap away.', 'vo', 3, '{try}'),
  ('See what {{brand}} is all about. Tap the link.', 'vo', 3, '{brand}'),
  ('Your dog will thank you. Get {{product}} at the link below.', 'vo', 3, '{link}');
