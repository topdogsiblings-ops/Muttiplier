-- Presets for the sanity checks on clips submitted from the checklist (Settings -> Defaults).
alter table public.settings
  add column clip_aspect_width int not null default 9 check (clip_aspect_width > 0),
  add column clip_aspect_height int not null default 16 check (clip_aspect_height > 0),
  add column clip_min_width int not null default 1080 check (clip_min_width > 0),
  add column clip_min_height int not null default 1920 check (clip_min_height > 0),
  add column clip_min_fps numeric not null default 24 check (clip_min_fps > 0),
  add column clip_max_fps numeric not null default 60 check (clip_max_fps > 0),
  add column vo_min_share numeric not null default 0.6 check (vo_min_share > 0),
  add column vo_max_share numeric not null default 1.75 check (vo_max_share > 0),
  add constraint settings_clip_fps_range check (clip_min_fps <= clip_max_fps),
  add constraint settings_vo_share_range check (vo_min_share <= vo_max_share);
