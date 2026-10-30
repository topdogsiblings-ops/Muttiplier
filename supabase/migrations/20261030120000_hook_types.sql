-- Angles are now Hook types: the kind of opening a hook uses (set on hooks only; VOs no longer
-- get one). The table keeps its name. Adds the hook types the 2025–26 creative benchmarks found
-- strongest. Already applied by hand on the live project; safe to run again.
insert into public.angles (name, description) values
  ('Confession', 'Owns up to something ("I almost didn''t try this…", "I was doing it wrong"): honest, relatable, and one of the strongest hook types in the benchmarks.'),
  ('Newness', 'Leads with something new: a new product, a new way, "I just found…". The top-performing hook type in the benchmarks.'),
  ('Price anchor', 'Frames the price against something familiar ("less than a coffee a week"). Strong in the benchmarks, often with twice the spend.'),
  ('Offer', 'Leads with the brand''s current offer or deal. Fill it in from the brand''s brief, and only use offers the brand has confirmed.')
on conflict (name) do nothing;

comment on table public.angles is 'Hook types (shown as such in the app; the table keeps its old name): the kind of opening a hook uses, tracked to learn which win.';
