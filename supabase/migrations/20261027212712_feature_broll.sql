-- B-roll can be tied to a product feature: its clips then only go under VOs about that feature,
-- and live in their own folder, b-roll/<beat>/<feature slug>/. Untagged b-roll is generic.

-- A feature's slug names its b-roll folder, so it's set once and never changes (renaming the
-- feature keeps the folder). Existing features are backfilled from their names.
alter table public.product_features add column slug text;

create function private.set_feature_slug() returns trigger
language plpgsql set search_path = '' as $$
declare
  base text := coalesce(nullif(lower(trim(both '-' from regexp_replace(new.name, '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'feature');
  candidate text := base;
  n int := 2;
begin
  if tg_op = 'UPDATE' and old.slug is not null then
    new.slug := old.slug; -- fixed once set
    return new;
  end if;
  if new.slug is null or new.slug = '' then
    while exists (select 1 from public.product_features f where f.product_id = new.product_id and f.slug = candidate and f.id <> new.id) loop
      candidate := base || '-' || n;
      n := n + 1;
    end loop;
    new.slug := candidate;
  end if;
  return new;
end;
$$;

create trigger set_feature_slug before insert or update on public.product_features
  for each row execute function private.set_feature_slug();

comment on column public.product_features.slug is 'Names the feature''s b-roll folder (b-roll/<beat>/<slug>/). Set from the name on insert and never changed.';

-- the feature a b-roll shot is for; null = generic b-roll for its beat
alter table public.broll_shots
  add column feature_id uuid references public.product_features (id) on delete set null;
create index broll_shots_feature_id_idx on public.broll_shots (feature_id) where feature_id is not null;

comment on column public.broll_shots.feature_id is 'The product feature this b-roll is for: its clips go in b-roll/<beat>/<feature slug>/ and only under VOs about that feature. Null = generic.';
