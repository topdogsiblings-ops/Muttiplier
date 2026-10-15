-- Link on-camera people to the allowlisted user who signs in as them (optional, one-to-one).
alter table public.people
  add column allowed_user_id uuid unique references public.allowed_users (id) on delete set null;
