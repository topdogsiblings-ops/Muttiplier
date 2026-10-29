-- VOs are written in a shoot, for one product: about one of its features, or the product as a whole.
alter table public.body_templates
  add column product_id uuid references public.products(id) on delete cascade,
  add column shoot_id uuid references public.shoots(id) on delete set null;

comment on column public.body_templates.product_id is 'The product the VO sells. feature_id (optional) is one of its features; null = about the product as a whole.';
comment on column public.body_templates.shoot_id is 'The shoot it was written in. Later shoots of the same product can use it too.';

create index body_templates_product_id_idx on public.body_templates (product_id);
create index body_templates_shoot_id_idx on public.body_templates (shoot_id);

-- a VO's feature must be one of its product's
create or replace function private.check_vo_feature()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.feature_id is not null and not exists (
    select 1 from public.product_features f where f.id = new.feature_id and f.product_id = new.product_id
  ) then
    raise exception 'A VO''s feature must be one of its product''s features';
  end if;
  return new;
end;
$$;

create trigger body_templates_check_feature
  before insert or update of feature_id, product_id on public.body_templates
  for each row execute function private.check_vo_feature();

-- every VO so far was about a feature: it's for that feature's product
update public.body_templates b set product_id = f.product_id
from public.product_features f
where f.id = b.feature_id and b.product_id is null;
