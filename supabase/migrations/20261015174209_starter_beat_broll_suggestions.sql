-- Starter b-roll suggestions for each beat of the five formats. Only fills formats with none
-- yet, so anything the team has written is kept. Edit freely in Library -> Formats & VOs.
update public.formats f set beat_broll = v.suggestions::jsonb
from (values
  ('F01', '{
    "problem": [
      {"description": "Dog showing the problem behaviour", "product_visible": false},
      {"description": "Owner reacting, frustrated or worried", "product_visible": false},
      {"description": "The aftermath: mess, chewed item or pulled lead", "product_visible": false}
    ],
    "product": [
      {"description": "Opening the pack", "product_visible": true},
      {"description": "Product in hand, close-up", "product_visible": true},
      {"description": "Dog trying the product for the first time", "product_visible": true}
    ],
    "result": [
      {"description": "Calm, happy dog afterwards", "product_visible": false},
      {"description": "Owner and dog relaxed together", "product_visible": false},
      {"description": "Settled dog with the product in frame", "product_visible": true}
    ]
  }'),
  ('F02', '{
    "problem": [
      {"description": "An everyday moment where the struggle shows", "product_visible": false},
      {"description": "Owner sitting with the dog, thoughtful", "product_visible": false},
      {"description": "Dog doing the problem behaviour", "product_visible": false}
    ],
    "product": [
      {"description": "Opening the delivery", "product_visible": true},
      {"description": "The dog''s first reaction to the product", "product_visible": true},
      {"description": "Product as part of the daily routine", "product_visible": true}
    ],
    "result": [
      {"description": "Everyday moments that show it working", "product_visible": false},
      {"description": "Dog and owner relaxed together", "product_visible": false},
      {"description": "Product on the shelf next to the dog''s things", "product_visible": true}
    ]
  }'),
  ('F03', '{
    "setup": [
      {"description": "Product on the counter, ready to go", "product_visible": true},
      {"description": "Dog watching curiously", "product_visible": false},
      {"description": "Everything laid out, shot from above", "product_visible": true}
    ],
    "demo": [
      {"description": "Hands using the product, close-up", "product_visible": true},
      {"description": "Dog interacting with the product", "product_visible": true},
      {"description": "Wide shot of the whole routine", "product_visible": true}
    ],
    "result": [
      {"description": "The dog''s reaction afterwards", "product_visible": false},
      {"description": "The finished result, close-up", "product_visible": false},
      {"description": "Product put back in its place", "product_visible": true}
    ]
  }'),
  ('F04', '{
    "before": [
      {"description": "Dog mid-problem, from a fixed angle you can match later", "product_visible": false},
      {"description": "The mess or chaos in the home", "product_visible": false},
      {"description": "Owner frustrated in the same spot", "product_visible": false}
    ],
    "product": [
      {"description": "Product being used in the same spot", "product_visible": true},
      {"description": "Product close-up", "product_visible": true}
    ],
    "after": [
      {"description": "Same angle as the before shot, now calm", "product_visible": false},
      {"description": "Happy dog with the product nearby", "product_visible": true},
      {"description": "Owner relaxed in the same spot", "product_visible": false}
    ]
  }'),
  ('F05', '{
    "tip": [
      {"description": "Owner demonstrating the tip", "product_visible": false},
      {"description": "Close-up of the key step", "product_visible": false},
      {"description": "Dog responding to the tip", "product_visible": false}
    ],
    "product": [
      {"description": "Product in hand as part of the tip", "product_visible": true},
      {"description": "Dog with the product", "product_visible": true}
    ],
    "payoff": [
      {"description": "Relaxed, content dog", "product_visible": false},
      {"description": "Owner and dog smiling together", "product_visible": false}
    ]
  }')
) as v(code, suggestions)
where f.code = v.code and f.beat_broll = '{}'::jsonb;
