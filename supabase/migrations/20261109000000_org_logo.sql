-- An organisation's photo (logo), set by its admins in Settings → Profile.
-- The photo lives in the public org-logos bucket at <org id>/logo; logo_url is its public address,
-- with a version on the end so a new photo isn't hidden behind a cached old one.

alter table public.orgs add column logo_url text;
comment on column public.orgs.logo_url is 'Public URL of its photo in the org-logos bucket, set by its admins.';

grant update (name, logo_url) on public.orgs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- only an org's admins write under its folder (and can see what's there, which upserting needs)
create policy "org admins read their logo" on storage.objects for select to authenticated
  using (bucket_id = 'org-logos' and (select private.is_org_admin(((storage.foldername(name))[1])::uuid)));
create policy "org admins add their logo" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-logos' and (select private.is_org_admin(((storage.foldername(name))[1])::uuid)));
create policy "org admins replace their logo" on storage.objects for update to authenticated
  using (bucket_id = 'org-logos' and (select private.is_org_admin(((storage.foldername(name))[1])::uuid)));
create policy "org admins remove their logo" on storage.objects for delete to authenticated
  using (bucket_id = 'org-logos' and (select private.is_org_admin(((storage.foldername(name))[1])::uuid)));

-- my_orgs carries the photo, for the organisation switcher
drop function public.my_orgs();
create function public.my_orgs()
returns table (id uuid, name text, slug text, role text, display_name text, is_current boolean, has_chosen boolean, entitled boolean, klip_access text, logo_url text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.slug, m.role, m.display_name,
    o.id = private.current_org_id(),
    p.active_org_id is not null,
    private.org_is_entitled(o.id),
    private.org_klip_access(o.id),
    o.logo_url
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  join public.profiles p on p.id = m.user_id
  where m.user_id = (select auth.uid())
  order by o.name;
$$;
revoke all on function public.my_orgs() from public, anon;
grant execute on function public.my_orgs() to authenticated, service_role;
