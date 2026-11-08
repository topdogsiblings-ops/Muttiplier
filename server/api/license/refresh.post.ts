// Trade a license token this server signed (expired is fine, up to 30 days old) for a fresh one,
// re-checked against the org's billing now. If the user has left the org, or the token is too old,
// Klip has to sign in again (401).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string } | null>(event).catch(() => null)
  const license = body?.token ? readLicense(event, body.token) : null
  if (!license) throw createError({ statusCode: 401, statusMessage: 'Not a license token: sign in again' })
  if (!refreshable(license)) throw createError({ statusCode: 401, statusMessage: 'This license is too old to refresh: sign in again' })

  const { data } = await serviceDb(event).from('org_members').select('org_id')
    .eq('org_id', license.orgId).eq('user_id', license.userId).maybeSingle()
  if (!data) throw createError({ statusCode: 401, statusMessage: 'You\'re no longer in this organisation: sign in again' })
  return await issueLicense(event, license.orgId, license.userId)
})
