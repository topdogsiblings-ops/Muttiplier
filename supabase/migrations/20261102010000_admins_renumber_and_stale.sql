-- Renumbering a shoot's codes and marking it stale are admin jobs too, like its status.

create or replace function private.guard_shoot_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_org_admin(new.org_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A new shoot starts as a draft';
    end if;
    if new.stale_at is not null then
      raise exception 'Only an admin can mark a shoot stale';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only an admin can change a shoot''s status';
  end if;
  if new.stale_at is distinct from old.stale_at or new.stale_by is distinct from old.stale_by then
    raise exception 'Only an admin can mark a shoot stale';
  end if;
  return new;
end $$;

drop trigger guard_shoot_status on public.shoots;
create trigger guard_shoot_status before insert or update of status, stale_at, stale_by on public.shoots
  for each row execute function private.guard_shoot_status();

create or replace function public.renumber_shoot_items(p_shoot_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null
    and not private.is_org_admin((select s.org_id from public.shoots s where s.id = p_shoot_id)) then
    raise exception 'Only an admin can renumber a shoot';
  end if;

  with templates as (
    select
      i.kind,
      coalesce(i.hook_template_id, i.body_template_id, i.cta_template_id) as template_id,
      case i.kind when 'hook' then 'H' when 'body' then 'V' else 'C' end as prefix,
      min(i.sort_order) as first_order,
      min(i.created_at) as first_created
    from public.shoot_items i
    where i.shoot_id = p_shoot_id
    group by i.kind, coalesce(i.hook_template_id, i.body_template_id, i.cta_template_id)
  ),
  ranked as (
    select kind, template_id, prefix,
      row_number() over (partition by prefix order by first_order, first_created, template_id) as n
    from templates
  )
  update public.shoot_items i
  set code = r.prefix || lpad(r.n::text, greatest(2, length(r.n::text)), '0')
  from ranked r
  where i.shoot_id = p_shoot_id
    and i.kind = r.kind
    and coalesce(i.hook_template_id, i.body_template_id, i.cta_template_id) = r.template_id
    and i.code is distinct from r.prefix || lpad(r.n::text, greatest(2, length(r.n::text)), '0');
end $$;
