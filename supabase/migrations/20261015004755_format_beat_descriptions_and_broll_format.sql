-- What each beat of a format is for (shown in the b-roll planner and used to suggest shots),
-- and which format section a b-roll shot belongs to (null = general product shots).
alter table public.formats
  add column beat_descriptions jsonb not null default '{}' check (jsonb_typeof(beat_descriptions) = 'object');

alter table public.broll_shots
  add column format_id uuid references public.formats (id) on delete set null;
create index broll_shots_format_id_idx on public.broll_shots (format_id) where format_id is not null;

update public.formats f set beat_descriptions = v.descriptions::jsonb
from (values
  ('F01', '{"problem": "The relatable pain point: the dog showing the problem behaviour and the owner''s frustration.", "product": "The product being introduced and used: unboxing, close-ups, the dog trying it.", "result": "The payoff after using it: a calmer, happier dog and a relieved owner."}'),
  ('F02', '{"problem": "What life was like before: the honest struggle the creator had with their dog.", "product": "Discovering and trying the product: first impressions and the dog''s reaction.", "result": "How it''s going now: everyday moments that show it worked for them."}'),
  ('F03', '{"setup": "Introduce the product and the scene: product on the counter, dog nearby, everything ready.", "demo": "The product in use, step by step: hands-on close-ups and the dog interacting with it.", "result": "The outcome of the demo: the dog''s reaction and the finished result."}'),
  ('F04', '{"before": "The before state: the mess, struggle or problem, framed so the after shot can match it.", "product": "The product that makes the change: a clear look at it in use.", "after": "The after state: the same spot or situation, now visibly better."}'),
  ('F05', '{"tip": "The tip itself, demonstrated: the owner showing what to do with the dog.", "product": "Where the product fits into the tip: it in hand or in use.", "payoff": "Why the tip matters: a relaxed, happy dog and owner."}')
) as v(code, descriptions)
where f.code = v.code;
