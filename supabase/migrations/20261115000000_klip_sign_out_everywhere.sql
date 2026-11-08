-- Sign Klip out everywhere, like Netflix's "sign out of all devices": an admin signs the whole org
-- out, and licences issued before then aren't renewed (/api/license/refresh says sign in again), so
-- every computer has to connect again with a new code. A computer that's offline keeps its current
-- licence until it expires (72 hours at most).

alter table public.orgs add column klip_signed_out_at timestamptz;
comment on column public.orgs.klip_signed_out_at is 'Klip licences for this org issued before this aren''t renewed. Set by public.sign_out_klip_everywhere.';

create function public.sign_out_klip_everywhere()
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  org uuid := private.current_org_id();
  at timestamptz := now();
begin
  if org is null or not private.is_org_admin(org) then
    raise exception 'Only an admin can sign Klip out everywhere';
  end if;
  update public.orgs set klip_signed_out_at = at where id = org;
  return at;
end $$;

revoke all on function public.sign_out_klip_everywhere() from public, anon;
grant execute on function public.sign_out_klip_everywhere() to authenticated;
