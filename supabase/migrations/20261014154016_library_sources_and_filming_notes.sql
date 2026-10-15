-- A source link (inspiration, reference video, brief) on every Library item,
-- and filming instructions on hooks for the shot sheet.
alter table public.hook_templates
  add column source_url text check (source_url ~* '^https?://'),
  add column filming_notes text;
alter table public.cta_templates add column source_url text check (source_url ~* '^https?://');
alter table public.body_templates add column source_url text check (source_url ~* '^https?://');
alter table public.formats add column source_url text check (source_url ~* '^https?://');
alter table public.angles add column source_url text check (source_url ~* '^https?://');
