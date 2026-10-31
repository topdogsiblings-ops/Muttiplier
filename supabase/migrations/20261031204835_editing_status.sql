-- Shoots go draft -> planned -> shooting -> filmed -> editing (Pawcessor edits raw/ into edited/,
-- with treatment sidecars) -> edited (shown "Live": recipes built, batches running). The unused
-- ingested, rendering and done statuses are gone: batches carry their own statuses.
alter table public.shoots drop constraint shoots_status_check;
alter table public.shoots add constraint shoots_status_check
  check (status in ('draft', 'planned', 'shooting', 'filmed', 'editing', 'edited'));
