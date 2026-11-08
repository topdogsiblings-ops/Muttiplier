# Kreate's Supabase Auth emails

Branded versions of the emails Supabase Auth sends, sent through Resend from
`hello@kreate.ugckompany.com`. This folder is the source of truth; they're set on the project with
the Management API (`PATCH https://api.supabase.com/v1/projects/<ref>/config/auth`, fields
`mailer_subjects_<type>` and `mailer_templates_<type>_content`, where type is `confirmation`,
`recovery`, `email_change` or `reauthentication`), or by pasting into **Authentication → Emails →
Templates**. Change a file here, then set it again.

| Dashboard tab | Subject | File |
|---|---|---|
| Confirm signup | `Confirm your email for Kreate` | `confirm-signup.html` |
| Reset password | `Reset your Kreate password` | `reset-password.html` |
| Change email address | `Confirm your new email for Kreate` | `change-email.html` |
| Reauthentication | `Your Kreate security code` | `reauthentication.html` |
| Password changed (security notice, turned on) | `Your Kreate password was changed` | `password-changed.html` |
| Email address changed (security notice, turned on) | `Your Kreate email was changed` | `email-changed.html` |

The notices are `mailer_subjects_<type>_notification`, `mailer_templates_<type>_notification_content`
and `mailer_notifications_<type>_enabled`, with type `password_changed` or `email_changed`. The
password one links to `/login?reset=1`, which opens the login page on resetting a password.

Kreate doesn't use Invite user (invites are its own emails, sent by the app) or Magic link, so
those keep Supabase's defaults.

The `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` and `{{ .Token }}` placeholders are
Supabase's; leave them as they are. The logo is `https://kreate.ugckompany.com/icon-192.png` (email
apps don't show SVG). Light only, built from tables with inline styles so Gmail, Outlook and Apple
Mail all show it the same.
