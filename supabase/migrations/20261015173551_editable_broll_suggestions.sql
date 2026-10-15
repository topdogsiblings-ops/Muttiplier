-- Editable b-roll suggestions, written by the team (no built-in lists).
-- Per format: beat -> [{ description, product_visible }]. Settings: the general product shots list.
alter table public.formats
  add column beat_broll jsonb not null default '{}' check (jsonb_typeof(beat_broll) = 'object');
alter table public.settings
  add column general_broll jsonb not null default '[]' check (jsonb_typeof(general_broll) = 'array');
