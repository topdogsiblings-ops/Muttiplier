// For the activation page: whether a code is waiting to be approved, before the member approves it.
export default defineEventHandler(async (event) => {
  await licenseUser(event)
  const code = normaliseUserCode(String(getQuery(event).code ?? ''))
  if (code.length !== 8) return { valid: false }
  const { data: row } = await serviceDb(event).from('license_device_codes').select('status, expires_at').eq('user_code', code).maybeSingle()
  return { valid: !!row && row.status === 'pending' && new Date(row.expires_at).getTime() > Date.now() }
})
