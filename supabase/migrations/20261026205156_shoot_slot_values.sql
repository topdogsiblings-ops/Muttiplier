-- Custom slots ({{benefit}}, {{offer}}…) are filled in on each shoot, not kept on the product.
-- The planner's Fill in slots saves them here; every shoot starts blank.
alter table public.shoots
  add column slot_values jsonb not null default '{}'::jsonb;

comment on column public.shoots.slot_values is 'Custom slot values for this shoot''s scripts, e.g. {"benefit": "calmer walks"}. Built-ins (brand, product, dog) are filled automatically.';
