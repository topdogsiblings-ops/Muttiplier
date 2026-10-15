-- Every new brand starts with all active channels assigned (they can be unticked on the brand page).
create function private.assign_all_channels() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.brand_channels (brand_id, channel_id)
  select new.id, c.id from public.channels c where c.active
  on conflict do nothing;
  return new;
end $$;

create trigger assign_all_channels after insert on public.brands
for each row execute function private.assign_all_channels();

revoke all on function private.assign_all_channels() from public, anon;
grant execute on function private.assign_all_channels() to authenticated, service_role;

-- Existing brands with no channels get all active ones. Brands with a deliberate selection are left alone.
insert into public.brand_channels (brand_id, channel_id)
select b.id, c.id
from public.brands b
cross join public.channels c
where c.active
  and not exists (select 1 from public.brand_channels bc where bc.brand_id = b.id);
