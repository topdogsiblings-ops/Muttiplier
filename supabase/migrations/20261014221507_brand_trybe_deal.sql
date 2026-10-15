-- Trybe deal terms on brands. pay_model becomes a fixed choice: flat fee, commission, or both.
alter table public.brands
  add constraint brands_pay_model check (pay_model in ('flat', 'commission', 'both')),
  add column flat_fee numeric(10, 2) check (flat_fee >= 0),
  add column commission_pct numeric(5, 2) check (commission_pct between 0 and 100),
  add column currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  add column trybe_score numeric(6, 2) check (trybe_score >= 0),
  add column videos_required int check (videos_required >= 0);

comment on column public.brands.flat_fee is 'Flat fee per approved video, in currency';
comment on column public.brands.commission_pct is 'Commission on sales, as a percentage';
comment on column public.brands.trybe_score is 'The brand''s score on Trybe';
comment on column public.brands.videos_required is 'Videos the deal asks for';
