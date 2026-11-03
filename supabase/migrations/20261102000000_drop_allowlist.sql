-- The allowlist is gone: orgs and org_members replaced it, and the deployed app no longer reads it
-- or the singleton columns.
alter table public.people drop column allowed_user_id;
alter table public.settings drop column singleton;
alter table public.dropbox_connection drop column singleton;
drop table public.allowed_users;
drop function private.is_allowed();
drop function private.is_admin();
