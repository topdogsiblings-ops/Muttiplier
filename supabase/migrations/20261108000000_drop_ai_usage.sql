-- Kreate has no built-in AI any more: people bring their own, through Kreate's AI connector.
-- So the per-org AI usage log (20261102030000) and the function the server logged with go.

drop function if exists public.record_ai_usage(uuid, bigint, bigint, bigint, bigint);
drop table if exists public.org_ai_usage;
