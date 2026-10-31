-- Formats come in two classes. Modular: a VO between a Library hook and CTA. Standalone: the
-- VO opens and closes itself; its first beat is "hook" and its last "cta", filmed as takes like
-- any beat, and it's never paired with Library hooks or CTAs.
alter table public.formats
  add column kind text not null default 'modular' check (kind in ('modular', 'standalone')),
  add column beat_examples jsonb not null default '{}' check (jsonb_typeof(beat_examples) = 'object'),
  add column beat_display jsonb not null default '{}' check (jsonb_typeof(beat_display) = 'object');

comment on column public.formats.kind is 'modular (Library hook + VO + CTA) or standalone (first beat "hook", last "cta", never paired).';
comment on column public.formats.beat_descriptions is 'beat -> guidance: what to write in it (shown in the VO editor and used by AI drafting).';
comment on column public.formats.beat_examples is 'beat -> an example line for it.';
comment on column public.formats.beat_display is 'beat -> "face" (the speaker on camera) or "broll" (their voice over b-roll). Missing = broll, except a standalone format''s hook and cta beats (face). Treatments can override it.';

-- Wording mixes: alternate wordings of a VO's beats, combined into extra versions (per person).
-- vo_variations is now shown as "Cast mixes": beats swapped between the people cast on a VO.
alter table public.shoots
  add column wording_variations int not null default 1 check (wording_variations >= 0);
comment on column public.shoots.wording_variations is 'Extra versions per VO from combining alternate beat wordings, per person (0 = only the first wordings).';
comment on column public.shoots.vo_variations is 'Cast mixes: mixed versions per VO per channel, beats swapped between the people cast on it (0 = none).';
