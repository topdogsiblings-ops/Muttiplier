-- Invites are emailed (Resend, /api/invites/send): when the email last went out, shown in
-- Settings → Members beside Resend invite. Only the server sets it, with the service role.
alter table public.org_invites add column emailed_at timestamptz;
comment on column public.org_invites.emailed_at is 'When the invite email last went out. Set by /api/invites/send.';
