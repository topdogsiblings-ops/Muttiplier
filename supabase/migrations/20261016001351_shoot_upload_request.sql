-- One Upload for the whole shoot: anyone can ask every phone to upload its clips. Each phone
-- with the checklist open (or that opens it later) starts on its own while this is set.
alter table public.shoots
  add column upload_requested_at timestamptz,
  add column upload_requested_by uuid references public.profiles (id) on delete set null;

create index shoots_upload_requested_by_idx on public.shoots (upload_requested_by);

-- The checklist stays live on every phone: ticks, skips, b-roll counts, starting and ending
-- the shoot, and the upload request.
alter publication supabase_realtime add table public.shoots, public.shoot_items, public.broll_shots;
