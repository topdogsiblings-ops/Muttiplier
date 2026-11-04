-- Connecting Top Dog Cut with a code (the "device code" sign-in, like PyCharm or the GitHub CLI):
-- Cut asks for a code, shows it, and opens Kit's activation page; a signed-in member approves it
-- for one of their orgs; Cut, checking back every few seconds, then gets its license token once.
-- Cut never signs in to Supabase. Only the server reads or writes these, with the service role.

create table public.license_device_codes (
  id uuid primary key default gen_random_uuid(),
  -- sha-256 of the secret Cut checks back with (the secret itself is never stored)
  device_code_hash text not null unique,
  -- what the person sees and approves, e.g. KQ7XM2PD (shown as KQ7X-M2PD)
  user_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'claimed')),
  org_id uuid references public.orgs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  approved_at timestamptz,
  last_polled_at timestamptz
);
create index license_device_codes_org_id_idx on public.license_device_codes (org_id);
create index license_device_codes_user_id_idx on public.license_device_codes (user_id);
alter table public.license_device_codes enable row level security;
revoke all on public.license_device_codes from anon, authenticated;
comment on table public.license_device_codes is 'Pending Top Dog Cut connections (device code sign-in). Server only.';
