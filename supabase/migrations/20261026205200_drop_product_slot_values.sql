-- Products no longer carry slot values: custom slots are filled in on each shoot
-- (shoots.slot_values). Their data is dropped with the column.
alter table public.products drop column slot_values;
