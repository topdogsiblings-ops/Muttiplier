-- Hooks written in a shoot, and hooks kept for one product.
-- shoot_id: written on that shoot, for that shoot only (not in the Library).
-- product_id: saved to a product: in the Library under it, offered on that product's shoots.
-- Neither: a general Library hook, offered on every shoot.
alter table public.hook_templates
  add column shoot_id uuid references public.shoots (id) on delete cascade,
  add column product_id uuid references public.products (id) on delete cascade,
  add constraint hook_templates_one_home check (shoot_id is null or product_id is null);

create index hook_templates_shoot_id_idx on public.hook_templates (shoot_id) where shoot_id is not null;
create index hook_templates_product_id_idx on public.hook_templates (product_id) where product_id is not null;

comment on column public.hook_templates.shoot_id is 'Written in this shoot, for this shoot only; hidden from the Library until saved to the product.';
comment on column public.hook_templates.product_id is 'Kept for this product: in the Library under it, offered only on its shoots. Null (with no shoot) = a general hook.';
