-- A product's core features (what it does, what sets it apart), set on the brand page. Every VO
-- is written by one person on the cast about one feature of one product, so a VO's product is
-- its feature's product. VOs no longer have a title: they're shown by feature and script.
-- VOs written before this have no feature yet; the Library asks for one when they're edited.
create table public.product_features (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index product_features_product_id_idx on public.product_features (product_id);
create index product_features_created_by_idx on public.product_features (created_by);

create trigger set_updated_at before update on public.product_features
  for each row execute function private.set_updated_at();
create trigger stamp_creator before insert or update on public.product_features
  for each row execute function private.stamp_creator();

alter table public.product_features enable row level security;
revoke all on public.product_features from anon, authenticated;
grant select, insert, update, delete on public.product_features to authenticated;

create policy "allowlisted users can read" on public.product_features
  for select to authenticated using ((select private.is_allowed()));
create policy "allowlisted users can insert" on public.product_features
  for insert to authenticated with check ((select private.is_allowed()));
create policy "allowlisted users can update" on public.product_features
  for update to authenticated using ((select private.is_allowed())) with check ((select private.is_allowed()));
create policy "allowlisted users can delete" on public.product_features
  for delete to authenticated using ((select private.is_allowed()));

-- a removed feature leaves its VOs needing a new one, rather than deleting them
alter table public.body_templates
  add column feature_id uuid references public.product_features (id) on delete set null;
create index body_templates_feature_id_idx on public.body_templates (feature_id);

alter table public.body_templates alter column title drop not null;
