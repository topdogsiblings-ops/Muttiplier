-- Brands imported from a Scrybe CSV export (format v2).
-- trybe_brand_id is Trybe's own stable ID, so re-importing updates a brand instead of duplicating it.
-- trybe_data keeps every Scrybe column we don't have a dedicated field for.
alter table public.brands
  add column trybe_brand_id text unique,
  add column trybe_data jsonb check (trybe_data is null or jsonb_typeof(trybe_data) = 'object');
