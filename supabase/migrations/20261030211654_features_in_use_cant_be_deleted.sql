-- A feature that VOs or b-roll shots are about can't be deleted: they'd otherwise quietly become
-- about the product as a whole (VOs) or generic (b-roll). Move them to another feature, or
-- remove them, first. Renaming a feature is fine (its folder slug never changes).
create or replace function private.block_feature_in_use()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  vos int;
  shots int;
begin
  select count(*) into vos from public.body_templates where feature_id = old.id;
  select count(*) into shots from public.broll_shots where feature_id = old.id;
  if vos > 0 or shots > 0 then
    raise exception '"%" is still used by % VO% and % b-roll shot%. Move them to another feature or remove them first.',
      old.name, vos, case when vos = 1 then '' else 's' end, shots, case when shots = 1 then '' else 's' end
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger product_features_block_in_use
  before delete on public.product_features
  for each row execute function private.block_feature_in_use();
