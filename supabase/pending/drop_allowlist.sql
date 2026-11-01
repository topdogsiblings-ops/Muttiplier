-- The allowlist is gone: orgs and org_members replaced it. ONLY after the multi-org app is deployed
-- (the app before it reads allowed_users and filters on singleton, and breaks without them): move
-- this into supabase/migrations/ as <timestamp>_drop_allowlist.sql, then db push.
alter table public.people drop column allowed_user_id;
alter table public.settings drop column singleton;
alter table public.dropbox_connection drop column singleton;
drop table public.allowed_users;
drop function private.is_allowed();
drop function private.is_admin();
