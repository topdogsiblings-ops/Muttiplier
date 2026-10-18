-- A shortlist holds entries (a recipe and a b-roll variation), not bare recipes.
alter table public.shoot_shortlists rename column recipe_ids to entry_ids;
comment on column public.shoot_shortlists.entry_ids is 'Entry ids (recipe + variation, e.g. nix_H01-joe_V02-mak_C01-bren_v2) in this shortlist; later shortlists skip them';
