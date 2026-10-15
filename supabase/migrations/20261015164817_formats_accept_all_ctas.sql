-- A format only describes the VO. Any CTA can follow any VO, so every format accepts both
-- CTA modes. (The column stays for the shootsheet.json contract; the app no longer edits it.)
update public.formats set cta_modes = '{sync,vo}' where cta_modes is distinct from '{sync,vo}';
