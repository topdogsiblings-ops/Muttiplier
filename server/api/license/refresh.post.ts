// Trade a license token this server signed (expired is fine, up to 30 days old) for a fresh one,
// re-checked against the org's billing now. If the user has left the org, the token is too old, or
// an admin has signed the org out of Klip everywhere since it was issued, Klip has to sign in again (401).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string } | null>(event).catch(() => null)
  const license = body?.token ? readLicense(event, body.token) : null
  if (!license) throw createError({ statusCode: 401, statusMessage: 'Not a license token: sign in again' })
  if (!refreshable(license)) throw createError({ statusCode: 401, statusMessage: 'This license is too old to refresh: sign in again' })

  const db = serviceDb(event)
  const [{ data }, { data: org }] = await Promise.all([
    db.from('org_members').select('org_id').eq('org_id', license.orgId).eq('user_id', license.userId).maybeSingle(),
    db.from('orgs').select('klip_signed_out_at').eq('id', license.orgId).maybeSingle()
  ])
  if (!data) throw createError({ statusCode: 401, statusMessage: 'You\'re no longer in this organisation: sign in again' })
  if (org?.klip_signed_out_at && license.issuedAt < Date.parse(org.klip_signed_out_at)) throw createError({ statusCode: 401, statusMessage: 'Klip was signed out on all devices: sign in again' })
  return await issueLicense(event, license.orgId, license.userId)
})
