-- backfill: touching each row lets the trigger set its slug from its name
update public.product_features set slug = null where slug is null;

-- every feature has its slug now, and slugs are unique per product
alter table public.product_features
  alter column slug set not null,
  add constraint product_features_slug_key unique (product_id, slug);
