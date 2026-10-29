-- A VO is written by the signed-in user's person on the cast, and only they (or an admin) can
-- change it, delete it or its hook / CTA links. Restrictive policies: ANDed with the allowlist ones.
create or replace function private.is_me(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.people p
    join public.allowed_users u on u.id = p.allowed_user_id
    where p.id = p_person_id
      and u.email = lower(auth.jwt() ->> 'email')
      and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
  );
$$;

create or replace function private.can_edit_vo(p_body_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or exists (
    select 1 from public.body_templates b where b.id = p_body_template_id and private.is_me(b.person_id)
  );
$$;

create policy "only the writer or an admin writes a vo" on public.body_templates
  as restrictive for insert to authenticated
  with check ((select private.is_admin()) or private.is_me(person_id));
create policy "only the writer or an admin edits a vo" on public.body_templates
  as restrictive for update to authenticated
  using ((select private.is_admin()) or private.is_me(person_id))
  with check ((select private.is_admin()) or private.is_me(person_id));
create policy "only the writer or an admin deletes a vo" on public.body_templates
  as restrictive for delete to authenticated
  using ((select private.is_admin()) or private.is_me(person_id));

create policy "only the writer or an admin links" on public.vo_hook_links
  as restrictive for insert to authenticated with check (private.can_edit_vo(body_template_id));
create policy "only the writer or an admin unlinks" on public.vo_hook_links
  as restrictive for delete to authenticated using (private.can_edit_vo(body_template_id));
create policy "only the writer or an admin links" on public.vo_cta_links
  as restrictive for insert to authenticated with check (private.can_edit_vo(body_template_id));
create policy "only the writer or an admin unlinks" on public.vo_cta_links
  as restrictive for delete to authenticated using (private.can_edit_vo(body_template_id));
