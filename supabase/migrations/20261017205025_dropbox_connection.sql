-- The Dropbox account clips upload to (spec §12): one connection for the whole team, made by
-- an admin in Settings. The refresh token is encrypted by the server (with a key derived from
-- DROPBOX_APP_SECRET) before it's stored, so reading this row gives nobody access to Dropbox;
-- phones get short-lived access tokens from /api/dropbox/token.

create table public.dropbox_connection (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  account_id text not null,
  account_name text,
  account_email text,
  refresh_token_enc text not null,
  -- the folder everything goes under, e.g. "/UGC"
  root text not null default '/UGC' check (root ~ '^/[^/](.*[^/])?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index dropbox_connection_created_by_idx on public.dropbox_connection (created_by);

create trigger set_updated_at before update on public.dropbox_connection
  for each row execute function private.set_updated_at();
create trigger stamp_creator before insert or update on public.dropbox_connection
  for each row execute function private.stamp_creator();

alter table public.dropbox_connection enable row level security;
revoke all on public.dropbox_connection from anon, authenticated;
grant select, insert, update, delete on public.dropbox_connection to authenticated;

create policy "allowlisted users can read" on public.dropbox_connection
  for select to authenticated using ((select private.is_allowed()));
create policy "admins can insert" on public.dropbox_connection
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins can update" on public.dropbox_connection
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins can delete" on public.dropbox_connection
  for delete to authenticated using ((select private.is_admin()));
