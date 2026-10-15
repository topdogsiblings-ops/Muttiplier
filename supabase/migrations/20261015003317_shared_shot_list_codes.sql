-- Everyone on a shoot films the same list, so an item's code is shared by all people:
-- H03 is the same hook for Joe and Sam (their files still go in their own folders).
alter table public.shoot_items drop constraint shoot_items_code_key;
alter table public.shoot_items
  add constraint shoot_items_code_key unique (shoot_id, person_id, code) deferrable initially immediate;

-- Re-number by template: one code per hook / VO / CTA, the same for every person.
create or replace function public.renumber_shoot_items(p_shoot_id uuid) returns void
language sql security invoker set search_path = '' as $$
  with templates as (
    select
      i.kind,
      coalesce(i.hook_template_id, i.body_template_id, i.cta_template_id) as template_id,
      case
        when i.kind = 'hook' and bool_or(coalesce(h.is_universal, false)) then 'U'
        when i.kind = 'hook' then 'H'
        when i.kind = 'body' then 'V'
        else 'C'
      end as prefix,
      min(i.sort_order) as first_order,
      min(i.created_at) as first_created
    from public.shoot_items i
    left join public.hook_templates h on h.id = i.hook_template_id
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
$$;

revoke all on function public.renumber_shoot_items(uuid) from public, anon;
grant execute on function public.renumber_shoot_items(uuid) to authenticated, service_role;
