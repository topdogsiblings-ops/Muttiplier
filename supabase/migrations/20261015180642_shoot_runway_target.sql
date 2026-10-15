-- Target submissions per channel per month, for the calculator's runway (months of supply).
alter table public.shoots
  add column runway_target int not null default 60 check (runway_target > 0);
