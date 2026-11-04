-- Any UGC niche, not just dogs. Each org now sets up for itself what was built in for topdogugc:
--  - channel slots: slots each channel fills with its own value ({{dog}} -> "my Doberman" was the
--    only one). A line that uses one is filmed once per channel; any other line once per person.
--  - script rules: words to flag while writing, with the warning to show and what to say instead
--    (topdogugc's "owner" -> "dog parent" was the only one). AI drafting avoids them too.
--  - an org profile (asked for when the org is started) and the AI preamble written from it, which
--    tells AI drafting who the org is. Null preamble = the recommended one, from the profile.
-- channels.dogs and channels.dog_phrase stay for now (the manifest still sends dogs; dog_phrase is
-- copied into slot_values and no longer read) and go once the deployed app has stopped using them.

alter table public.settings
  add column org_profile jsonb not null default '{}',
  add column ai_preamble text,
  add column channel_slots jsonb not null default '[]',
  add column script_rules jsonb not null default '[]';
comment on column public.settings.org_profile is 'What the org does, for AI drafting: {about, products, creators, audience, voice, language}.';
comment on column public.settings.ai_preamble is 'What AI drafting is told about the org. Null: the recommended preamble, written from org_profile.';
comment on column public.settings.channel_slots is 'Slots each channel fills with its own value: [{name, description, example}].';
comment on column public.settings.script_rules is 'Words flagged in scripts: [{phrases: [...], message, suggestion}].';

alter table public.channels add column slot_values jsonb not null default '{}';
comment on column public.channels.slot_values is 'This channel''s value for each channel slot (settings.channel_slots), e.g. {"dog": "my Doberman"}.';
comment on column public.channels.dog_phrase is 'Deprecated: copied into slot_values.dog. To be dropped.';

-- {{dog}} becomes a channel slot wherever a channel has a dog phrase
update public.channels set slot_values = jsonb_build_object('dog', dog_phrase) where trim(dog_phrase) <> '';
update public.settings s set channel_slots = '[{"name": "dog", "description": "How the channel''s dog is said in a script", "example": "my Doberman"}]'
where exists (select 1 from public.channels c where c.org_id = s.org_id and trim(c.dog_phrase) <> '');

-- topdogugc: what was built in
update public.settings s set
  org_profile = '{
    "about": "a UGC agency whose creators film ads for dog products",
    "products": "dog products: food, treats, supplements and gear",
    "creators": "creators filming at home with their own dogs",
    "audience": "dog parents",
    "voice": "warm and real, like a dog parent talking to a friend",
    "language": ""
  }',
  script_rules = '[{
    "phrases": ["owner", "ownership", "dog owner", "pet owner", "puppy owner"],
    "message": "We don''t call people \"owners\": it''s too cold.",
    "suggestion": "dog parent"
  }]'
from public.orgs o
where o.id = s.org_id and o.slug = 'topdogugc';

-- Universal hooks were retired (20261018012058): their {{dog}}-only check and the flag go.
alter table public.hook_templates drop constraint if exists hook_templates_universal_slots;
alter table public.hook_templates drop column if exists is_universal;

-- Starting an org also saves its profile (the session's token may still name the last org, so
-- this can't be a separate update afterwards).
drop function public.create_org(text, text);
create function public.create_org(p_name text, p_slug text, p_profile jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  org uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not public.org_signup_open() then raise exception 'New organisations aren''t open yet'; end if;
  if jsonb_typeof(coalesce(p_profile, '{}')) <> 'object' then raise exception 'The profile must be an object'; end if;
  insert into public.orgs (name, slug, created_by) values (trim(p_name), p_slug, me) returning id into org;
  insert into public.org_members (org_id, user_id, role) values (org, me, 'admin');
  update public.profiles set active_org_id = org where id = me;
  insert into public.settings (org_id, org_profile) values (org, coalesce(p_profile, '{}'));
  insert into public.treatments (org_id, name, description, kind, placement, needs, component, settings, active, system, sort_order) values
    (org, 'Face to camera', 'The whole video with the speaker on camera: every VO beat shows them talking (a talking-head version). Skipped where a recipe already shows them throughout.', 'layout', 'video', array['speaker_video'], 'layout', '{"show": "face"}', true, true, 1),
    (org, 'Over b-roll', 'The whole video over b-roll: every VO beat is their voice over footage, none on camera. Skipped where a recipe already plays over b-roll throughout.', 'layout', 'video', '{}', 'layout', '{"show": "broll"}', true, true, 2);
  return org;
end $$;
revoke all on function public.create_org(text, text, jsonb) from public, anon;
grant execute on function public.create_org(text, text, jsonb) to authenticated, service_role;
