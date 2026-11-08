import type { H3Event } from 'h3'

// Kreate's own emails (invites), sent through Resend from hello@kreate.ugckompany.com, in the same
// look as the Supabase Auth emails (supabase/templates): tables and inline styles, a PNG logo, light only.

const FROM = 'Kreate <hello@kreate.ugckompany.com>'
const LOGO = 'https://kreate.ugckompany.com/icon-192.png'
const FONT = '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif'
const INK = '#0c0a09'
const TEXT = '#44403c'
const MUTED = '#78716c'
const LINE = '#e7e5e4'
const PAGE = '#f5f5f4'

/** Text safe to put in HTML. */
export const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export const emailParagraph = (html: string, size = 15, color = TEXT, margin = '0 0 16px') =>
  `<p style="margin:${margin};font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.6)}px;color:${color};">${html}</p>`

export const emailStrong = (text: string) => `<strong style="color:${INK};">${escapeHtml(text)}</strong>`

export function emailButton(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
  <tr><td style="border-radius:999px;background:${INK};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
  </td></tr>
</table>
${emailParagraph('Button not working? Paste this into your browser:', 13, MUTED, '0 0 6px')}
<p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;"><a href="${escapeHtml(href)}" style="color:${TEXT};text-decoration:underline;">${escapeHtml(href)}</a></p>`
}

/** The page around an email: logo, a card with the heading and body, and the footer. */
export function emailLayout(options: { preheader: string, heading: string, body: string, note: string }) {
  const link = (href: string, text: string, color: string) => `<a href="${href}" style="color:${color};text-decoration:underline;">${text}</a>`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr><td style="padding:0 4px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;"><img src="${LOGO}" width="36" height="36" alt="Kreate" style="display:block;border:0;border-radius:8px;background:#ffffff;"></td>
            <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.3px;color:${INK};">Kreate <span style="font-size:12px;font-weight:300;letter-spacing:0;color:${MUTED};">by UGC Kompany</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:36px 32px;">
          <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.4px;color:${INK};">${escapeHtml(options.heading)}</h1>
          ${options.body}
        </td></tr>
        <tr><td style="padding:20px 4px 0;">
          ${emailParagraph(options.note, 13, MUTED, '0 0 8px')}
          ${emailParagraph(`Questions? Email ${link('mailto:hello@ugckompany.com', 'hello@ugckompany.com', TEXT)}.`, 13, MUTED, '0 0 8px')}
          ${emailParagraph(`Kreate by UGC Kompany &middot; ${link('https://kreate.ugckompany.com', 'kreate.ugckompany.com', MUTED)}`, 12, MUTED, '0')}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Send one email through Resend. `idempotencyKey` stops a double click sending it twice (Resend
 * keeps a key for 24 hours).
 */
export async function sendEmail(event: H3Event, message: { to: string, subject: string, html: string, text: string, replyTo?: string, idempotencyKey?: string }) {
  const key = useRuntimeConfig(event).resendApiKey
  if (!key) throw createError({ statusCode: 503, statusMessage: 'Email isn\'t set up yet. Set RESEND_API_KEY.' })
  try {
    return await $fetch<{ id: string }>('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {})
      },
      body: {
        from: FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: [message.replyTo] } : {})
      }
    })
  } catch (failure) {
    const detail = (failure as { data?: { message?: string } }).data?.message
    throw createError({ statusCode: 502, statusMessage: `The email couldn't be sent${detail ? `: ${detail}` : ''}` })
  }
}

/** The invite to join an organisation, from the admin who sent it. */
export function inviteEmail(options: { orgName: string, inviterName: string, email: string, role: string, link: string }) {
  const { orgName, inviterName, email, role, link } = options
  const as = role === 'admin' ? 'an admin' : 'a member'
  const html = emailLayout({
    preheader: `${inviterName} invited you to ${orgName} on Kreate.`,
    heading: `Join ${orgName} on Kreate`,
    body: emailParagraph(`${emailStrong(inviterName)} invited you to join ${emailStrong(orgName)} on Kreate, as ${as}.`)
      + emailParagraph('Kreate is where the team plans its UGC shoots: the scripts, the shot lists and who films what. Joining is free.')
      + emailButton('Accept the invite', link)
      + emailParagraph(`Sign in or create your account with ${emailStrong(email)} (or Continue with Google, if it's a Google account) and you're in.`, 14, MUTED, '24px 0 0'),
    note: `${escapeHtml(inviterName)} sent this to ${escapeHtml(email)}. Not expecting it? You can ignore it: nothing happens unless you sign in. Replying reaches ${escapeHtml(inviterName)}.`
  })
  const text = [
    `${inviterName} invited you to join ${orgName} on Kreate, as ${as}.`,
    '',
    `Accept the invite: ${link}`,
    '',
    `Sign in or create your account with ${email} (or Continue with Google) and you're in. Joining is free.`,
    '',
    `Not expecting this? Ignore it: nothing happens unless you sign in. Questions? hello@ugckompany.com`
  ].join('\n')
  return { subject: `${inviterName} invited you to ${orgName} on Kreate`, html, text }
}
