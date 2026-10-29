-- CTAs written in a shoot, and CTAs kept for one product, like hooks.
alter table public.cta_templates
  add column shoot_id uuid references public.shoots (id) on delete cascade,
  add column product_id uuid references public.products (id) on delete cascade,
  add constraint cta_templates_one_home check (shoot_id is null or product_id is null);

create index cta_templates_shoot_id_idx on public.cta_templates (shoot_id) where shoot_id is not null;
create index cta_templates_product_id_idx on public.cta_templates (product_id) where product_id is not null;

comment on column public.cta_templates.shoot_id is 'Written in this shoot, for this shoot only; hidden from the Library until saved to the product.';
comment on column public.cta_templates.product_id is 'Kept for this product: in the Library under it, offered only on its shoots. Null (with no shoot) = a general CTA.';

-- Templates written in a shoot can be deleted (when they come off it unused); Library ones can't.
create policy "allowlisted users can delete shoot hooks" on public.hook_templates
  for delete to authenticated using ((select private.is_allowed()) and shoot_id is not null);
create policy "allowlisted users can delete shoot ctas" on public.cta_templates
  for delete to authenticated using ((select private.is_allowed()) and shoot_id is not null);
create policy "allowlisted users can delete shoot vos" on public.body_templates
  for delete to authenticated using ((select private.is_allowed()) and shoot_id is not null);

-- A VO linked to hooks and/or CTAs only goes with those (one-way: they still go with other VOs).
-- No links on a side = any hook (or CTA) on the shoot.
create table public.vo_hook_links (
  body_template_id uuid not null references public.body_templates (id) on delete cascade,
  hook_template_id uuid not null references public.hook_templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (body_template_id, hook_template_id)
);
create index vo_hook_links_hook_idx on public.vo_hook_links (hook_template_id);

create table public.vo_cta_links (
  body_template_id uuid not null references public.body_templates (id) on delete cascade,
  cta_template_id uuid not null references public.cta_templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (body_template_id, cta_template_id)
);
create index vo_cta_links_cta_idx on public.vo_cta_links (cta_template_id);

alter table public.vo_hook_links enable row level security;
alter table public.vo_cta_links enable row level security;

create policy "allowlisted users can read" on public.vo_hook_links for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.vo_hook_links for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can delete" on public.vo_hook_links for delete to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can read" on public.vo_cta_links for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.vo_cta_links for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can delete" on public.vo_cta_links for delete to authenticated using ((select private.is_allowed()));

grant select, insert, delete on public.vo_hook_links, public.vo_cta_links to authenticated;
