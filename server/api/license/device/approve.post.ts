// The member signed in to Kit approves (or denies) a code Klip is showing, for one of their orgs.
export default defineEventHandler(async (event) => {
  const userId = await licenseUser(event)
  const body = await readBody<{ code?: string, orgId?: string, approve?: boolean } | null>(event).catch(() => null)
  const code = normaliseUserCode(body?.code ?? '')
  if (code.length !== 8) throw createError({ statusCode: 400, statusMessage: 'That isn\'t a code from UGC Klip' })
  const approve = body?.approve !== false
  const orgId = approve ? await licenseOrg(event, userId, body?.orgId) : null

  const { data } = await serviceDb(event).from('license_device_codes')
    .update(approve
      ? { status: 'approved', org_id: orgId, user_id: userId, approved_at: new Date().toISOString() }
      : { status: 'denied', user_id: userId })
    .eq('user_code', code).eq('status', 'pending').gt('expires_at', new Date().toISOString())
    .select('id').maybeSingle()
  if (!data) throw createError({ statusCode: 404, statusMessage: 'That code has expired or was already used. Start again in UGC Klip.' })
  return { ok: true }
})
