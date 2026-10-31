-- The Text Thread format: a phone screen with a text conversation. Messages (shown "screen") are
-- text, not filmed; two voice notes (shown "voice_note") are filmed takes played as audio, so a
-- cast mix puts two people's voices in one thread. Already applied by hand on the live project;
-- safe to run again.
insert into public.formats (code, name, kind, description, beats, beat_descriptions, beat_examples, beat_display, beat_broll, target_seconds)
values (
  'F21', 'Text Thread', 'standalone',
  'A phone screen with a text conversation: messages pop in with typing dots, and two voice notes carry the real voices. Mostly not filmed: only the voice notes are recorded. Motion''s "Text message" format, with the highest spend use ratio in the pet category (12.0) of its 2025-26 benchmarks. Short: about 8-12 seconds.',
  array['hook', 'messages', 'voice note', 'reply', 'cta'],
  '{"hook": "The first message: short and intriguing, like a real text from a friend or sibling (or the dog).", "messages": "Three or four short texts that set up the problem or the question. Write each on its own line.", "voice note": "A spoken voice note from the other person: casual, a few seconds, the reaction or the question.", "reply": "Your spoken voice-note reply: how the product fixed it, in your own words.", "cta": "The last message: where to get it, with the link."}',
  '{"hook": "ok how is your dog suddenly so chill at the vet??", "messages": "seriously\nwhat did you do\nI need answers", "voice note": "Okay I need to know, because mine was a nightmare last week.", "reply": "Honestly? I started using {{product}} and it made such a difference.", "cta": "sending you the link now"}',
  '{"hook": "screen", "messages": "screen", "voice note": "voice_note", "reply": "voice_note", "cta": "screen"}',
  '{}',
  12
)
on conflict (code) do nothing;
