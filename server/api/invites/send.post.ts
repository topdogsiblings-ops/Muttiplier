import { serverSupabaseUser } from '#supabase/server'

// Email an invite (spec §3): an admin of the current org sends (or resends) the invite for an email
// already in its org_invites. It comes from hello@kreate.ugckompany.com with Reply-To the admin, and
// its button opens Kreate's sign-in on joining, with the email filled in. Signing in with that email
// (confirmed) turns the invite into a membership, as before.
export default defineEventHandler(async (event) => {
  const { db, admin, orgId } = await requireMember(event)
  if (!admin) throw createError({ statusCode: 403, statusMessage: 'Only an admin can invite people' })

  const body = await readBody<{ email?: string }>(event)
  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!email) throw createError({ statusCode: 400, statusMessage: 'Which email?' })

  // RLS keeps this to the current org's invites
  const { data: invite } = await db.from('org_invites').select('email, role').eq('email', email).maybeSingle()
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'There\'s no invite for that email' })

  const user = await serverSupabaseUser(event)
  const [{ data: org }, { data: me }] = await Promise.all([
    db.from('orgs').select('name').eq('id', orgId).single(),
    db.from('profiles').select('email, display_name, full_name').eq('id', user!.sub).single()
  ])
  const inviterName = me?.display_name || me?.full_name || me?.email || 'Your team'
  const orgName = org?.name ?? 'your team'

  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const link = `${origin}/login?${new URLSearchParams({ invite: email, org: orgName })}`
  const message = inviteEmail({ orgName, inviterName, email, role: invite.role, link })

  const sent = await sendEmail(event, {
    to: email,
    ...message,
    replyTo: me?.email ?? undefined,
    // a double click within the same minute sends it once
    idempotencyKey: `invite/${orgId}/${email}/${Math.floor(Date.now() / 60_000)}`
  })

  const emailedAt = new Date().toISOString()
  await serviceDb(event).from('org_invites').update({ emailed_at: emailedAt }).eq('org_id', orgId).eq('email', email)
  return { id: sent.id, emailedAt }
})
