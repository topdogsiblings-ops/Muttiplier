-- Title-case the seeded angle names and describe each one.
update public.angles as a set name = v.name, description = v.description
from (values
  ('curiosity', 'Curiosity', 'Opens a question the viewer needs answered, teasing a result or a secret without giving it away straight away.'),
  ('problem', 'Problem', 'Leads with a pain point viewers recognise from their own dog, then positions the product as the fix.'),
  ('testimonial', 'Testimonial', 'A first-hand, honest "here''s what happened when we tried it" story from the creator.'),
  ('pov', 'POV', 'Puts the viewer inside a relatable moment ("POV: your dog hears the doorbell") so they see themselves in it.'),
  ('skeptic', 'Skeptic', 'Starts from doubt ("I didn''t think this would work") and lets the result win the creator over.'),
  ('contrarian', 'Contrarian', 'Challenges common advice or a popular belief to stop the scroll, then offers a better way.'),
  ('demo', 'Demo', 'Shows the product in action and lets the visible result do the persuading.')
) as v(old_name, name, description)
where a.name = v.old_name;
