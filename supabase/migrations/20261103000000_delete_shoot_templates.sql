-- Hooks, VOs and CTAs written in a shoot can be deleted (20261029210137 added the policies) but the
-- table grant never followed, so removing one failed with "permission denied". The policies still
-- keep Library ones (no shoot) undeletable, and a VO to its writer or an admin.
grant delete on public.hook_templates, public.body_templates, public.cta_templates to authenticated;
