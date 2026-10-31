-- Built-in treatments (face to camera, over b-roll) are always on: they can't be switched off,
-- archived, deleted, or changed in kind.
create or replace function private.protect_system_treatments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.system then raise exception '"%" is built in and can''t be deleted.', old.name; end if;
    return old;
  end if;
  if old.system and (new.archived or not new.active or not new.system or new.kind <> old.kind or new.component <> old.component) then
    raise exception '"%" is built in: it''s always on, and can''t be archived or changed in kind.', old.name;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

update public.treatments set active = true where system and not active;
