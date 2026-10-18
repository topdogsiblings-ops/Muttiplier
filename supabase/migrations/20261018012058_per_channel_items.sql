-- Every hook, VO and CTA is filmed per person per channel (spec §5): a person films each item
-- once for every channel they're linked to, so each channel has its own clip. Universal hooks
-- are gone: every hook is an H code. New shoots batch 5% of their recipes by default.

-- any kind of item belongs to a channel now (was hooks only)
alter table public.shoot_items drop constraint shoot_items_channel_hooks_only;

-- one code per template, shared by every person and channel
alter table public.shoot_items drop constraint shoot_items_code_key;
alter table public.shoot_items
  add constraint shoot_items_code_key unique (shoot_id, person_id, channel_id, code) deferrable initially immediate;

-- no more universal hooks: everything is H / V / C
update public.hook_templates set is_universal = false where is_universal;

create or replace function public.renumber_shoot_items(p_shoot_id uuid) returns void
language sql security invoker set search_path = '' as $$
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
$$;

-- batches take 5% of a shoot's valid recipes unless the shoot says otherwise
alter table public.settings alter column default_submission_rate set default 0.05;
update public.settings set default_submission_rate = 0.05 where default_submission_rate = 0.15;
alter table public.shoots alter column submission_rate set default 0.05;
