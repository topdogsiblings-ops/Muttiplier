-- A VO is cast on one channel: everyone cast on it is linked to that channel (and so is the
-- writer), and they perform it there only. On that channel their beats can be mixed.
alter table public.body_templates
  add column cast_channel_id uuid references public.channels (id) on delete set null;
comment on column public.body_templates.cast_channel_id is 'The channel a VO is cast on: its cast (vo_cast) are linked to it, perform it there only, and their beats mix there.';

create or replace function private.check_vo_cast_channel()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  channel uuid;
begin
  select cast_channel_id into channel from public.body_templates where id = new.body_template_id;
  if channel is null then
    raise exception 'Pick the channel the VO is cast on before casting anyone.';
  end if;
  if not exists (select 1 from public.person_channels pc where pc.person_id = new.person_id and pc.channel_id = channel) then
    raise exception 'Everyone cast on a VO has to be on its cast channel.';
  end if;
  return new;
end;
$$;

create trigger vo_cast_check_channel
  before insert or update on public.vo_cast
  for each row execute function private.check_vo_cast_channel();
