-- VOs can belong to one person on the cast (who wrote it and performs it) and to specific
-- products. No person = anyone on a shoot can perform it; no products = universal (any product).

alter table public.body_templates
  add column person_id uuid references public.people (id) on delete set null;
create index body_templates_person_id_idx on public.body_templates (person_id);

create table public.body_template_products (
  body_template_id uuid not null references public.body_templates (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (body_template_id, product_id)
);
create index body_template_products_product_id_idx on public.body_template_products (product_id);

alter table public.body_template_products enable row level security;
revoke all on public.body_template_products from anon, authenticated;
grant select, insert, delete on public.body_template_products to authenticated;

create policy "allowlisted users can read" on public.body_template_products
  for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.body_template_products
  for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can delete" on public.body_template_products
  for delete to authenticated using ((select private.is_allowed()));
