-- Treatments: ways a finished recipe is presented. Every active treatment applies to every recipe
-- that has what it needs; each treated version is its own recipe. Muttiplier decides where they
-- apply, the editor prepares any footage they need, and Showdog draws them from the spec.
create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  -- layout: changes which footage plays (face to camera, over b-roll); overlay: a layer drawn on
  -- top (search bar, text thread, labels, badge); footage: needs the editor to prepare clips
  -- (greenscreen, picture-in-picture)
  kind text not null check (kind in ('layout', 'overlay', 'footage')),
  -- where it goes: the hook, the whole video, or the CTA
  placement text not null check (placement in ('hook', 'video', 'cta')),
  -- what a recipe needs for it: text written for it (AI writes it from the script), the
  -- speaker's video, old footage (filmed before a date), the shoot's {{offer}}
  needs text[] not null default '{}' check (needs <@ array['text', 'speaker_video', 'old_footage', 'offer']),
  -- the component Showdog draws it with, and its settings
  component text not null,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  source_url text check (source_url ~* '^https?://'),
  -- on: applied to recipes; off: kept but not applied
  active boolean not null default true,
  -- built in: can't be deleted or archived (switching it off is fine)
  system boolean not null default false,
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

comment on table public.treatments is 'Ways a finished recipe is presented. Active ones apply to every recipe that has what they need; each treated version is its own recipe.';

alter table public.treatments enable row level security;
create policy "allowlisted users can read" on public.treatments for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.treatments for insert to authenticated with check ((select private.is_allowed()) and not system);
create policy "allowlisted users can update" on public.treatments for update to authenticated using ((select private.is_allowed())) with check ((select private.is_allowed()));
create policy "allowlisted users can delete their own" on public.treatments for delete to authenticated using ((select private.is_allowed()) and not system);
grant select, insert, update, delete on public.treatments to authenticated;

-- built-in treatments stay: they can't be archived, deleted, or stop being built in
create or replace function private.protect_system_treatments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.system then raise exception '"%" is built in and can''t be deleted. Switch it off instead.', old.name; end if;
    return old;
  end if;
  if old.system and (new.archived or not new.system or new.kind <> old.kind or new.component <> old.component) then
    raise exception '"%" is built in: it can be switched off, but not archived or changed in kind.', old.name;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger treatments_protect_system
  before update or delete on public.treatments
  for each row execute function private.protect_system_treatments();

insert into public.treatments (name, description, kind, placement, needs, component, settings, system, sort_order) values
  ('Face to camera', 'The whole video with the speaker on camera: every VO beat shows them talking (a talking-head version). Skipped where a recipe already shows them throughout.', 'layout', 'video', array['speaker_video'], 'layout', '{"show": "face"}', true, 1),
  ('Over b-roll', 'The whole video over b-roll: every VO beat is their voice over footage, none on camera. Skipped where a recipe already plays over b-roll throughout.', 'layout', 'video', '{}', 'layout', '{"show": "broll"}', true, 2),
  ('Search bar', 'Opens on a search bar typing the question the hook answers ("why does my dog…"). A native-search look, one of the strongest in the pet category.', 'overlay', 'hook', array['text'], 'search_bar', '{"position": "top"}', false, 10),
  ('Text thread', 'Retells the video as a text conversation (the dog texting its owner), message by message over the footage. The highest spend ratio in the pet benchmarks.', 'overlay', 'video', array['text'], 'text_thread', '{"sender": "dog"}', false, 11),
  ('Then & now labels', 'Labels old footage "then" and today''s "now", with the dog''s age.', 'overlay', 'video', array['old_footage'], 'then_now_labels', '{}', false, 12),
  ('Offer badge', 'A badge with the brand''s current offer over the CTA. Only when the shoot has a confirmed {{offer}}.', 'overlay', 'cta', array['offer'], 'offer_badge', '{"position": "bottom"}', false, 13),
  ('Unusual text placement', 'The hook line as large on-screen text in an unexpected spot (on the dog, across the product), not the usual caption bar.', 'overlay', 'hook', array['text'], 'placed_text', '{}', false, 14),
  ('Greenscreen', 'The speaker cut out and placed over the product page or b-roll, talking to camera.', 'footage', 'video', array['speaker_video'], 'greenscreen', '{"background": "product_page"}', false, 20),
  ('Picture-in-picture', 'The speaker in a small box in the corner over b-roll, so viewers see who''s talking.', 'footage', 'video', array['speaker_video'], 'picture_in_picture', '{"corner": "bottom-right"}', false, 21);
