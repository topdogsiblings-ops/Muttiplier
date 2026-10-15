-- Starter general product shots (suggested in every shoot's "General product shots" b-roll
-- section). Only fills the list if it's still empty. Edit in Settings -> Defaults.
update public.settings set general_broll = '[
  {"description": "Pack shot on a clean, plain surface", "product_visible": true},
  {"description": "Label and ingredients close-up", "product_visible": true},
  {"description": "Product in hand, slow turn", "product_visible": true},
  {"description": "Opening the pack or lid", "product_visible": true},
  {"description": "Product poured, scooped or dispensed, no dog", "product_visible": true},
  {"description": "Texture close-up of the product itself", "product_visible": true},
  {"description": "Product next to the dog''s bowl or bed", "product_visible": true},
  {"description": "Product on the kitchen counter in everyday use", "product_visible": true}
]'::jsonb
where general_broll = '[]'::jsonb;
