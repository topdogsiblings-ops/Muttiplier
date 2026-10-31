-- A shoot marked stale is archived from view (the shoots list and brand pages hide it). It can be
-- marked stale at any status, and unmarked; its status is left as it was.
alter table public.shoots
  add column stale_at timestamptz,
  add column stale_by uuid references public.profiles (id);
comment on column public.shoots.stale_at is 'When the shoot was marked stale (archived from view); null = not stale.';
create index shoots_stale_by_idx on public.shoots (stale_by);
