-- Brands get a "piloting" stage between auditioning and active: the first sample video has gone in
-- (submitted to keep the sample rate up) before the brand is fully on.
alter table public.brands drop constraint brands_status_check;
alter table public.brands add constraint brands_status_check
  check (status in ('prospect', 'auditioning', 'piloting', 'active', 'paused'));
