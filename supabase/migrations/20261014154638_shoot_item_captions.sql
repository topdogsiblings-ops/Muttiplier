-- Hook captions are copied onto shoot items like scripts, and frozen (slots filled) when the shoot is planned.
alter table public.shoot_items
  add column caption text,
  add constraint shoot_items_caption_hooks_only check (caption is null or kind = 'hook');
