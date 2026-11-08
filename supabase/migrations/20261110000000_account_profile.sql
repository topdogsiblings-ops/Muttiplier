-- Your account (/account): the name and photo a person picks for themselves, across every org.
-- profiles.full_name and avatar_url keep coming from sign-in (Google), so these sit beside them;
-- the app shows display_name ?? full_name, and photo_url ?? avatar_url.

alter table public.profiles
  add column display_name text check (display_name is null or length(trim(display_name)) between 1 and 80),
  add column photo_url text;
comment on column public.profiles.display_name is 'The name they chose in Your account; overrides full_name from sign-in.';
comment on column public.profiles.photo_url is 'Their photo in the avatars bucket, chosen in Your account; overrides avatar_url from sign-in.';

-- Saves their name and photo, and their name in every org they're in (how they read on shot lists
-- and in Members), which RLS on org_members and people wouldn't let them reach outside the current org.
create function public.update_my_profile(p_display_name text, p_photo_url text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v_name text := nullif(trim(p_display_name), '');
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_photo_url is not null and p_photo_url not like '%/storage/v1/object/public/avatars/' || me::text || '/%' then
    raise exception 'that photo isn''t yours';
  end if;
  update public.profiles set display_name = v_name, photo_url = p_photo_url, updated_at = now() where id = me;
  if v_name is not null then
    update public.org_members set display_name = v_name where user_id = me;
    update public.people set name = v_name where user_id = me;
  end if;
end $$;
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- each person writes only under their own folder
create policy "people read their photo" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "people add their photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "people replace their photo" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "people remove their photo" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
